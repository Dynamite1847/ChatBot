import { useState, useEffect } from 'react'
import useStore from '../stores/store'
import { fetchSessions, createSession, deleteSession, updateSession } from '../utils/api'

export default function Sidebar() {
    const {
        sessions, setSessions, activeSessionId, setActiveSessionId,
        setActiveSession, setShowSettings, addToast
    } = useStore()

    const [renamingId, setRenamingId] = useState(null)
    const [renameVal, setRenameVal] = useState('')

    const reload = async () => {
        try {
            const data = await fetchSessions()
            setSessions(data)
        } catch { }
    }

    useEffect(() => { reload() }, [])

    const handleNew = async () => {
        try {
            const s = await createSession('新对话 ' + new Date().toLocaleTimeString('zh', { hour12: false, hour: '2-digit', minute: '2-digit' }))
            await reload()
            setActiveSessionId(s.id)
            setActiveSession(s)
        } catch (e) { addToast('创建失败: ' + e.message, 'error') }
    }

    const handleSelect = async (s) => {
        const { fetchSession } = await import('../utils/api')
        const full = await fetchSession(s.id)
        setActiveSessionId(s.id)
        setActiveSession(full)
    }

    const handleDelete = async (e, id) => {
        e.stopPropagation()
        if (!confirm('删除此对话？')) return
        await deleteSession(id)
        if (activeSessionId === id) { setActiveSessionId(null); setActiveSession(null) }
        await reload()
    }

    const startRename = (e, s) => {
        e.stopPropagation()
        setRenamingId(s.id)
        setRenameVal(s.name)
    }

    const submitRename = async (id) => {
        if (renameVal.trim()) await updateSession(id, { name: renameVal.trim() })
        setRenamingId(null)
        await reload()
    }

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">✦</div>
                    <span className="sidebar-logo-text">AI Client</span>
                </div>
                <button className="new-session-btn" onClick={handleNew}>
                    <span>+</span> 新建对话
                </button>
            </div>

            <div className="sidebar-sessions">
                {sessions.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '20px 0' }}>
                        暂无对话
                    </div>
                )}
                {sessions.map(s => (
                    <div
                        key={s.id}
                        className={`session-item ${activeSessionId === s.id ? 'active' : ''}`}
                        onClick={() => handleSelect(s)}
                    >
                        <span className="session-item-icon">💬</span>
                        <div className="session-item-info">
                            {renamingId === s.id ? (
                                <input
                                    className="rename-input"
                                    value={renameVal}
                                    onChange={e => setRenameVal(e.target.value)}
                                    onBlur={() => submitRename(s.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') submitRename(s.id); if (e.key === 'Escape') setRenamingId(null) }}
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                />
                            ) : (
                                <div className="session-item-name">{s.name}</div>
                            )}
                            <div className="session-item-meta">{s.message_count} 条消息</div>
                        </div>
                        <div className="session-item-actions">
                            <button className="icon-btn" title="重命名" onClick={e => startRename(e, s)}>✏️</button>
                            <button className="icon-btn danger" title="删除" onClick={e => handleDelete(e, s.id)}>🗑</button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="sidebar-footer">
                <button className="settings-btn" onClick={() => setShowSettings(true)}>
                    ⚙️ 设置 / API Key
                </button>
            </div>
        </div>
    )
}
