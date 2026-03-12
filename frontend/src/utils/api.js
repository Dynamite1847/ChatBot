const BASE = '/api'

export async function fetchConfig() {
    const r = await fetch(`${BASE}/config`)
    return r.json()
}

export async function saveConfig(config) {
    const r = await fetch(`${BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
    })
    return r.json()
}

export async function fetchSessions() {
    const r = await fetch(`${BASE}/sessions`)
    return r.json()
}

export async function createSession(name, system_prompt = '') {
    const r = await fetch(`${BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, system_prompt })
    })
    return r.json()
}

export async function fetchSession(id) {
    const r = await fetch(`${BASE}/sessions/${id}`)
    return r.json()
}

export async function updateSession(id, patch) {
    const r = await fetch(`${BASE}/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
    })
    return r.json()
}

export async function deleteSession(id) {
    const r = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' })
    return r.json()
}

export async function clearMessages(id) {
    const r = await fetch(`${BASE}/sessions/${id}/messages`, { method: 'DELETE' })
    return r.json()
}

export async function retryLastMessages(id, count = 2) {
    const r = await fetch(`${BASE}/sessions/${id}/messages/last?count=${count}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Retry failed')
    return r.json() // { ok: true, last_user_message: "..." }
}

export async function countTokens(messages) {
    const r = await fetch(`${BASE}/tokens/count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    })
    const data = await r.json()
    return data.token_count || 0
}

export async function uploadFile(file) {
    const form = new FormData()
    form.append('file', file)
    const r = await fetch(`${BASE}/files/upload`, { method: 'POST', body: form })
    if (!r.ok) throw new Error('Upload failed')
    return r.json()
}

/**
 * Stream a chat message. Calls onDelta(str), onUsage(obj), onFinish(), onError(str).
 * Returns an AbortController so the caller can cancel.
 */
export function streamChat(payload, { onDelta, onStatus, onUsage, onFinish, onError }) {
    const controller = new AbortController()

    fetch(`${BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
    }).then(async res => {
        if (!res.ok) {
            const text = await res.text()
            onError(text)
            return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            
            // Extract complete data chunks separated by \n\n
            let boundary = buffer.indexOf('\n\n')
            while (boundary !== -1) {
                const chunkStr = buffer.slice(0, boundary).trim()
                buffer = buffer.slice(boundary + 2)
                boundary = buffer.indexOf('\n\n')

                if (!chunkStr) continue

                // Some proxies might send multiple data lines in one chunk, split them
                const lines = chunkStr.split('\n')
                for (let line of lines) {
                    line = line.trim()
                    if (!line.startsWith('data: ')) continue
                    
                    const raw = line.slice(6).trim()
                    if (raw === '[DONE]') { onFinish(); return }
                    
                    try {
                        const parsed = JSON.parse(raw)
                        if (parsed.error) { onError(parsed.error); return }
                        if (parsed.status && onStatus) onStatus(parsed.status)
                        if (parsed.delta !== undefined) onDelta(parsed.delta)
                        if (parsed.usage) onUsage(parsed.usage)
                    } catch (e) {
                        console.error('JSON parse error out of chunk:', raw, e)
                    }
                }
            }
        }
        
        // Handle any trailing data that didn't have \n\n at the very end
        if (buffer.trim()) {
            const lines = buffer.trim().split('\n')
            for (let line of lines) {
                line = line.trim()
                if (!line.startsWith('data: ')) continue
                const raw = line.slice(6).trim()
                if (raw === '[DONE]') { onFinish(); return }
                try {
                    const parsed = JSON.parse(raw)
                    if (parsed.delta !== undefined) onDelta(parsed.delta)
                } catch(e) {}
            }
        }

        onFinish()
    }).catch(err => {
        if (err.name !== 'AbortError') onError(err.message)
    })

    return controller
}
