import { useState, useRef, useCallback, useEffect } from 'react'
import useStore from '../stores/store'
import { uploadFile, streamChat, countTokens, fetchSession, fetchSessions } from '../utils/api'

export default function InputBar() {
    const {
        activeSessionId, activeSession, setActiveSession,
        params, config,
        isStreamingMap, setIsStreaming, setIsThinking,
        setStreamingText, appendStreamingText,
        pendingFiles, addPendingFile, removePendingFile, setPendingFiles,
        promptTokenEstimate, setPromptTokenEstimate,
        setLastUsage, addToast,
        editingText, setEditingText,
        setSessions
    } = useStore()

    const [text, setText] = useState('')
    const [composing, setComposing] = useState(false)
    const [uploading, setUploading] = useState(0)
    const textareaRef = useRef(null)
    const fileInputRef = useRef(null)
    const abortRef = useRef(null)

    // Watch for editingText from store (set by ChatPanel.handleEdit)
    useEffect(() => {
        if (editingText !== null) {
            setText(editingText)
            setEditingText(null)
            // Focus and auto-resize
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus()
                    textareaRef.current.style.height = 'auto'
                    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
                }
            }, 50)
        }
    }, [editingText])


    // Auto resize textarea
    const handleTextChange = (e) => {
        setText(e.target.value)
        const ta = e.target
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
        // Estimate tokens
        estimateTokens(e.target.value)
    }

    // Debounce timer ref
    const tokenTimerRef = useRef(null)

    const estimateTokens = useCallback((msg) => {
        if (!msg.trim()) { setPromptTokenEstimate(0); return }
        
        if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current)
        
        tokenTimerRef.current = setTimeout(async () => {
            try {
                const msgs = [...(activeSession?.messages || []).map(m => ({
                    role: m.role, content: typeof m.content === 'string' ? m.content : '[multimodal]'
                })), { role: 'user', content: msg }]
                const count = await countTokens(msgs)
                setPromptTokenEstimate(count)
            } catch { }
        }, 500)
    }, [activeSession])

    const handleKeyDown = (e) => {
        // IME composition check: keyCode 229 is standard for composing.
        if (e.nativeEvent.isComposing || composing || e.keyCode === 229) {
            return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            // We can safely read text state here because IME composition is already done.
            // Also fallback to ref value just in case.
            const finalValue = textareaRef.current?.value || text
            handleSend(finalValue)
        }
    }

    const handleFileSelect = async (files) => {
        const fileList = Array.from(files)
        setUploading(fileList.length)
        for (const file of fileList) {
            try {
                addToast(`正在上传: ${file.name}…`, 'default')
                const result = await uploadFile(file)
                addPendingFile(result)
                addToast(`上传完成: ${file.name}`, 'success')
            } catch (e) {
                addToast('文件上传失败: ' + e.message, 'error')
            } finally {
                setUploading(prev => prev - 1)
            }
        }
    }

    const handlePaste = useCallback((e) => {
        const items = e.clipboardData?.items
        if (!items) return
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile()
                if (file) handleFileSelect([file])
            }
        }
    }, [])

    const handleDrop = (e) => {
        e.preventDefault()
        handleFileSelect(e.dataTransfer.files)
    }

    const handleSend = async (continueMsg = null) => {
        const msg = continueMsg || text.trim()
        if (!msg && pendingFiles.length === 0 && !continueMsg) return
        if (isStreaming) return
        if (!activeSessionId) { addToast('请先选择或创建一个对话', 'error'); return }

        const cfg = config || {}
        const providerName = params.provider || cfg.default_provider || 'anthropic'
        const model = params.model || cfg.default_model || ''

        const payload = {
            session_id: activeSessionId,
            message: msg || '',
            files: pendingFiles.length > 0 ? pendingFiles : undefined,
            provider: providerName,
            model,
            system_prompt: activeSession?.system_prompt || params.system_prompt || undefined,
            params: {
                max_tokens: params.max_tokens,
                temperature: params.temperature,
                top_p: params.top_p,
                frequency_penalty: params.frequency_penalty,
            },
            context_strategy: params.context_strategy,
            context_rounds: params.context_rounds,
            context_token_threshold: params.context_token_threshold,
        }

        // Optimistic UI update: immediately show the user's message
        let optimisticContent = payload.message
        if (payload.files && payload.files.length > 0) {
            optimisticContent = [
                { type: 'text', text: payload.message },
                ...payload.files.map(f => ({ type: 'image_url', image_url: { url: f.data_url } }))
            ]
        }
        setActiveSession({
            ...activeSession,
            messages: [...(activeSession.messages || []), {
                role: 'user',
                content: optimisticContent,
                created_at: new Date().toISOString()
            }]
        })

        setText('')
        setPendingFiles([])
        setPromptTokenEstimate(0)
        if (textareaRef.current) { textareaRef.current.style.height = 'auto' }

        const currentSessionId = activeSessionId; // Capture for closure
        setIsStreaming(currentSessionId, true)
        setStreamingText(currentSessionId, '')
        setIsThinking(currentSessionId, false)

        abortRef.current = streamChat(payload, {
            onDelta: (delta) => {
                setIsThinking(currentSessionId, false)
                appendStreamingText(currentSessionId, delta)
            },
            onStatus: (status) => {
                if (status === 'thinking') setIsThinking(currentSessionId, true)
            },
            onUsage: (usage) => setLastUsage(usage),
            onFinish: async () => {
                setIsStreaming(currentSessionId, false)
                setIsThinking(currentSessionId, false)
                // Reload session to get persisted messages
                try {
                    const updated = await fetchSession(currentSessionId)
                    if (useStore.getState().activeSessionId === currentSessionId) {
                        setActiveSession(updated)
                    }
                } catch { }
                setStreamingText(currentSessionId, '')
                // Delayed reload to pick up auto-generated title from DeepSeek
                setTimeout(async () => {
                    try {
                        const sessions = await fetchSessions()
                        setSessions(sessions)
                        // Also refresh active session to get updated name
                        if (useStore.getState().activeSessionId === currentSessionId) {
                            const fresh = await fetchSession(currentSessionId)
                            setActiveSession(fresh)
                        }
                    } catch { }
                }, 3000)
            },
            onError: (err) => {
                setIsStreaming(currentSessionId, false)
                setIsThinking(currentSessionId, false)
                setStreamingText(currentSessionId, '')
                addToast('错误: ' + err, 'error')
            }
        })
    }

    const handleStop = () => {
        if (abortRef.current) abortRef.current.abort()
        if (activeSessionId) {
            setIsStreaming(activeSessionId, false)
            setStreamingText(activeSessionId, '')
            setIsThinking(activeSessionId, false)
        }
    }

    const isStreaming = activeSessionId ? (isStreamingMap[activeSessionId] || false) : false;

    return (
        <div
            className="input-area"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
        >
            {/* Token estimate */}
            {promptTokenEstimate > 0 && (
                <div className="token-dashboard">
                    <div className="token-counter">
                        预估 Prompt: <span className="val">{promptTokenEstimate}</span> tokens
                    </div>
                </div>
            )}

            {/* File previews */}
            {(pendingFiles.length > 0 || uploading > 0) && (
                <div className="file-previews">
                    {pendingFiles.map((f, i) => (
                        <div key={i} className="file-preview-item">
                            {f.type === 'image'
                                ? <img className="file-preview-img" src={f.data_url} alt={f.filename} />
                                : <span>📄</span>
                            }
                            <span>{f.filename}</span>
                            <button className="file-preview-remove" onClick={() => removePendingFile(i)}>×</button>
                        </div>
                    ))}
                    {uploading > 0 && (
                        <div className="file-preview-item" style={{ opacity: 0.7 }}>
                            <span className="upload-spinner" style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                            <span>正在解析 {uploading} 个文件...</span>
                        </div>
                    )}
                </div>
            )}

            <div className="input-box">
                <button
                    className="upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="上传文件（图片/PDF/Word/Excel/md/TXT）"
                    disabled={uploading > 0}
                >📎</button>

                <textarea
                    ref={textareaRef}
                    className="message-input"
                    placeholder="输入消息… (Enter 发送，Shift+Enter 换行，支持拖拽/粘贴图片)"
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => setComposing(true)}
                    onCompositionEnd={() => setComposing(false)}
                    onPaste={handlePaste}
                    rows={1}
                    disabled={isStreaming}
                />

                {isStreaming
                    ? <button className="send-btn" onClick={handleStop} title="停止">⏹</button>
                    : <button className="send-btn" onClick={() => handleSend()} disabled={!text.trim() && pendingFiles.length === 0} title="发送">↑</button>
                }
            </div>

            <div className="input-hint">Enter 发送 · Shift+Enter 换行 · 支持拖拽和剪贴板图片</div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.docx,.doc,.xlsx,.xls,.md"
                style={{ display: 'none' }}
                onChange={e => handleFileSelect(e.target.files)}
            />
        </div>
    )
}
