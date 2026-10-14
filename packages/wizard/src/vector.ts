export interface VectorResult {
  id: string
  score: number
  metadata: Record<string, any>
  content?: string
}

export interface VectorAdapter {
  search(params: {
    query: string
    topK?: number
    filter?: Record<string, any>
  }): Promise<VectorResult[]>
}

export class DefaultVectorAdapter implements VectorAdapter {
  private baseUrl: string

  constructor(config: { baseUrl: string }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
  }

  async search(params: {
    query: string
    topK?: number
    filter?: Record<string, any>
  }): Promise<VectorResult[]> {
    const res = await fetch(`${this.baseUrl}/api/vector/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        topK: params.topK ?? 5,
        ...(params.filter ? { filter: params.filter } : {}),
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Vector search failed: ${res.status} — ${err.slice(0, 200)}`)
    }
    return res.json()
  }
}
