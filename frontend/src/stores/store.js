import { create } from 'zustand'

const useStore = create((set, get) => ({
    // Config
    config: null,
    setConfig: (config) => set({ config }),

    // Sessions
    sessions: [],
    setSessions: (sessions) => set({ sessions }),
    activeSessionId: null,
    setActiveSessionId: (id) => set({ activeSessionId: id }),
    activeSession: null,
    setActiveSession: (session) => set({ activeSession: session }),

    // Params (per-chat overrides)
    params: {
        provider: null,
        model: null,
        system_prompt: null,
        max_tokens: 100000,
        temperature: 1.0,
        top_p: 1.0,
        frequency_penalty: 0.0,
        context_strategy: 'rounds',
        context_rounds: 10,
        context_token_threshold: 8000,
    },
    setParams: (update) => set(s => ({ params: { ...s.params, ...update } })),

    // Streaming state (keyed by sessionId)
    isStreamingMap: {},
    setIsStreaming: (id, v) => set(s => ({ isStreamingMap: { ...s.isStreamingMap, [id]: v } })),
    
    isThinkingMap: {},
    setIsThinking: (id, v) => set(s => ({ isThinkingMap: { ...s.isThinkingMap, [id]: v } })),
    
    streamingTextMap: {},
    setStreamingText: (id, t) => set(s => ({ streamingTextMap: { ...s.streamingTextMap, [id]: t } })),
    appendStreamingText: (id, delta) => set(s => ({ 
        streamingTextMap: { 
            ...s.streamingTextMap, 
            [id]: (s.streamingTextMap[id] || '') + delta 
        } 
    })),

    // Token tracking
    promptTokenEstimate: 0,
    setPromptTokenEstimate: (n) => set({ promptTokenEstimate: n }),
    lastUsage: null,
    setLastUsage: (usage) => set({ lastUsage: usage }),

    // Pending files (before send)
    pendingFiles: [],
    setPendingFiles: (files) => set({ pendingFiles: files }),
    addPendingFile: (f) => set(s => ({ pendingFiles: [...s.pendingFiles, f] })),
    removePendingFile: (idx) => set(s => ({
        pendingFiles: s.pendingFiles.filter((_, i) => i !== idx)
    })),

    // Edit message (pass text from ChatPanel to InputBar)
    editingText: null,
    setEditingText: (t) => set({ editingText: t }),

    // Settings modal
    showSettings: false,
    setShowSettings: (v) => set({ showSettings: v }),

    // Toast
    toasts: [],
    addToast: (msg, type = 'default') => {
        const id = Date.now()
        set(s => ({ toasts: [...s.toasts, { id, msg, type }] }))
        setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500)
    },
}))

export default useStore
