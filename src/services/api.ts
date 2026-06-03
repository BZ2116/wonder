const BASE = ''

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  parseFile: async (file: File): Promise<{ text: string; fileName: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/api/files/parse`, { method: 'POST', body: form })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(data.error || `文件解析失败 (${res.status})`)
    }
    return res.json()
  },

  healthCheck: async (): Promise<{ ok: boolean; llm: boolean; python: boolean }> => {
    const [llmRes, pythonRes] = await Promise.allSettled([
      fetch(`${BASE}/api/health/llm`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${BASE}/api/health/ai-core`, { signal: AbortSignal.timeout(5000) }),
    ])
    const llm = llmRes.status === 'fulfilled' && llmRes.value.ok
    const python = pythonRes.status === 'fulfilled' && pythonRes.value.ok
    return { ok: llm && python, llm, python }
  },

  stream: async (
    path: string,
    body: unknown,
    onEvent: (event: string, data: string) => void,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new Error(`Stream ${path} failed (${res.status}): ${text}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('event: ')) {
          const event = lines[i].slice(7).trim()
          const dataLine = lines[i + 1]
          if (dataLine?.startsWith('data: ')) {
            onEvent(event, dataLine.slice(6))
          }
        }
      }
    }
  },
}
