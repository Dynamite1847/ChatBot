import { useEffect, useRef } from 'react'
import useStore from '../stores/store'
import MessageItem from './MessageItem'
import InputBar from './InputBar'
import { clearMessages, fetchSession, retryLastMessages, streamChat } from '../utils/api'

export default function ChatPanel() {
    const {
        activeSession, activeSessionId, setActiveSession,
        isStreaming, setIsStreaming, isThinking, setIsThinking,
        streamingText, setStreamingText, appendStreamingText,
        config, params,
        lastUsage, setLastUsage, addToast, setEditingText
    } = useStore()

    const bottomRef = useRef(null)
    const abortRef = useRef(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [activeSession?.messages?.length, streamingText])

    const handleClearChat = async () => {
        if (!activeSessionId) return
        if (!confirm('清空此对话的所有消息？')) return
        await clearMessages(activeSessionId)
        const updated = await fetchSession(activeSessionId)
        setActiveSession(updated)
    }

    // Retry: removes the last user+assistant pair and re-sends the user message
    const handleRetry = async () => {
        if (!activeSessionId || isStreaming) return
        try {
            const result = await retryLastMessages(activeSessionId, 2)
            const userMsg = result.last_user_message
            if (!userMsg) { addToast('没有可重试的消息', 'error'); return }

            // Reload session without the last pair
            const updated = await fetchSession(activeSessionId)
            setActiveSession(updated)

            // Re-send
            const cfg = config || {}
            const providerName = params.provider || cfg.default_provider || 'anthropic'
            const model = params.model || cfg.default_model || ''

            // Extract text and files if userMsg is an array (multimodal)
            let textContent = ''
            let filesPayload = undefined
            if (Array.isArray(userMsg)) {
                const texts = userMsg.filter(m => m.type === 'text')
                textContent = texts.map(t => t.text).join('\n')
                const media = userMsg.filter(m => m.type !== 'text')
                if (media.length > 0) {
                    filesPayload = media // Note: retry won't have raw bytes, it has data_urls. Backend needs to accept them or we just pass the text. Our current backend build_content accepts files if they have type=image or type=document. 
                    // Actually, the API stream_chat payload expects 'files' array in the format uploaded.
                    // Wait, retry might be tricky if the file is large, but let's pass it anyway. We'll reconstruct files structure if possible.
                    // For now, let's just pass userMsg directly if backend supports it, but our streaming endpoint expects `message` (string) and `files` (array).
                    // Actually, the easiest is to just pass the string if we can't reconstruct `files` perfectly. 
                    // Let's at least extract the text properly.
                }
            } else {
                textContent = typeof userMsg === 'string' ? userMsg : ''
            }

            const payload = {
                session_id: activeSessionId,
                message: textContent,
                // Files re-upload on retry is currently not fully supported because we don't store the raw pendingFiles object in the history in the exact same format. 
                // We'll at least send the text back. If they need files, they should use 'Edit'.
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

            setIsStreaming(true)
            setStreamingText('')
            setIsThinking(false)

            abortRef.current = streamChat(payload, {
                onDelta: (delta) => {
                    setIsThinking(false)
                    appendStreamingText(delta)
                },
                onStatus: (status) => {
                    if (status === 'thinking') setIsThinking(true)
                },
                onUsage: (usage) => setLastUsage(usage),
                onFinish: async () => {
                    setIsStreaming(false)
                    setIsThinking(false)
                    try {
                        const updated2 = await fetchSession(activeSessionId)
                        setActiveSession(updated2)
                    } catch { }
                    setStreamingText('')
                },
                onError: (err) => {
                    setIsStreaming(false)
                    setIsThinking(false)
                    setStreamingText('')
                    addToast('重试失败: ' + err, 'error')
                }
            })
        } catch (e) {
            addToast('重试失败: ' + e.message, 'error')
        }
    }

    // Edit: remove last user+assistant, put user text back into input for editing
    const handleEdit = async () => {
        if (!activeSessionId || isStreaming) return
        try {
            const result = await retryLastMessages(activeSessionId, 2)
            const userMsg = result.last_user_message
            if (!userMsg) { addToast('没有可编辑的消息', 'error'); return }
            const updated = await fetchSession(activeSessionId)
            setActiveSession(updated)
            // Put text into input bar for editing
            let textContent = ''
            if (Array.isArray(userMsg)) {
                textContent = userMsg.filter(m => m.type === 'text').map(t => t.text).join('\n')
            } else {
                textContent = typeof userMsg === 'string' ? userMsg : JSON.stringify(userMsg)
            }
            // Clean up attachment prefixes from text if they exist (e.g. "[附件: docs.pdf]\n...")
            textContent = textContent.replace(/\[附件:.*?\]\n/g, '')
            setEditingText(textContent)
        } catch (e) {
            addToast('编辑失败: ' + e.message, 'error')
        }
    }

    const currentProvider = params.provider || config?.default_provider || 'anthropic'
    const currentModel = params.model || config?.default_model || ''

    if (!activeSession) {
        return (
            <div className="chat-panel">
                <div className="no-session" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <div className="no-session-icon">✦</div>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        选择或创建一个对话
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        从左侧选择已有对话，或点击「新建对话」开始
                    </p>
                </div>
            </div>
        )
    }

    const messages = activeSession.messages || []
    const hasMessages = messages.length > 0 || isStreaming
    const nonSystemMessages = messages.filter(m => m.role !== 'system')
    const lastMsg = nonSystemMessages[nonSystemMessages.length - 1]
    const canRetry = !isStreaming && lastMsg && lastMsg.role === 'assistant'

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <div className="chat-header-left">
                    <span className="chat-session-name">{activeSession.name}</span>
                    <span className={`provider-badge ${currentProvider}`}>
                        {currentProvider === 'anthropic' ? '⬡' : currentProvider === 'google' ? '◈' : '○'}
                        {' '}{currentModel}
                    </span>
                    {isStreaming && (
                        <div className="status-bar">
                            <div className={`status-dot ${isThinking ? 'thinking' : 'streaming'}`} />
                            <span>{isThinking ? '🧠 AI 正在深度思考中…' : '生成中…'}</span>
                        </div>
                    )}
                </div>
                <div className="chat-header-right">
                    {lastUsage && (
                        <span className="usage-chip">
                            本轮: ↑{lastUsage.prompt_tokens} ↓{lastUsage.completion_tokens}
                        </span>
                    )}
                    {canRetry && (
                        <button className="btn-ghost" onClick={handleRetry} title="重新生成最后一条回复">
                            🔄 重试
                        </button>
                    )}
                    <button className="btn-ghost" onClick={handleClearChat}>清空对话</button>
                </div>
            </div>

            <div className="messages-area">
                <div className="messages-inner">
                    {!hasMessages && (
                        <div className="empty-state" style={{ paddingTop: 80, textAlign: 'center' }}>
                            <div className="empty-state-icon">💬</div>
                            <h2>开始你的对话</h2>
                            <p>在下方输入框中输入消息，支持图片、PDF、Word等文件</p>
                        </div>
                    )}

                    {nonSystemMessages.map((msg, i) => {
                        const isLast = i === nonSystemMessages.length - 1
                        const isSecondLast = i === nonSystemMessages.length - 2
                        return (
                            <MessageItem
                                key={i}
                                message={msg}
                                isStreaming={false}
                                onRetry={isLast && msg.role === 'assistant' && !isStreaming
                                    ? handleRetry : null}
                                onEdit={
                                    // Show edit on last user msg (which is secondLast if assistant is last, or last if user is last)
                                    (!isStreaming && msg.role === 'user' && (
                                        (isLast) || (isSecondLast && nonSystemMessages[nonSystemMessages.length - 1]?.role === 'assistant')
                                    )) ? handleEdit : null
                                }
                            />
                        )
                    })}

                    {/* Streaming assistant message */}
                    {isStreaming && (
                        <MessageItem
                            message={{ role: 'assistant', content: streamingText || '' }}
                            isStreaming={true}
                            streamingText={streamingText}
                        />
                    )}

                    <div ref={bottomRef} />
                </div>
            </div>

            <div style={{ maxWidth: 800, width: '100%', margin: '0 auto' }}>
                <InputBar />
            </div>
        </div>
    )
}
