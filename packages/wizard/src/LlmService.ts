async function fetchWithRetry(url: string, opts: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, opts)
    if (res.status !== 429 && res.status !== 502 && res.status !== 503) return res
    console.warn(`  ⏳ rate limited (${res.status}), waiting 30s before retry ${i + 1}/${retries}...`)
    await new Promise(r => setTimeout(r, 30000))
  }
  const res = await fetch(url, opts)
  return res
}

export class LlmService {
  private baseUrl: string
  private onToken?: (token: string) => void
  private token?: string

  constructor(config: { baseUrl: string; onToken?: (token: string) => void; token?: string }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.onToken = config.onToken
    this.token = config.token
  }

  async generateText(params: {
    instructions: string
    memory?: Record<string, { mimeType: string; data: string; name?: string }>
    model?: string
    max_tokens?: number
    onToken?: (token: string) => void
  }): Promise<string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    const res = await fetchWithRetry(`${this.baseUrl}/api/llm/generate_text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        instructions: params.instructions,
        ...(params.memory ? { memory: params.memory } : {}),
        ...(params.model ? { model: params.model } : {}),
        ...(params.max_tokens != null ? { max_tokens: params.max_tokens } : {}),
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`LLM generate_text failed: ${res.status} — ${err.slice(0, 200)}`)
    }

    const onToken = params.onToken ?? this.onToken
    return this.readSSEStream(res, onToken)
  }

  private async readSSEStream(res: Response, onToken?: (token: string) => void): Promise<string> {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (t.startsWith('data: ')) {
          const data = t.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const token = parsed.token || ''
            if (token) {
              fullText += token
              onToken?.(token)
            }
          } catch { /* skip */ }
        }
      }
    }

    return fullText
  }
}
