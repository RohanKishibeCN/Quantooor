import { randomUUID } from 'crypto'

interface MCPResponse {
  jsonrpc: string
  id: string
  result?: { content: Array<{ type: string; text?: string }> }
  error?: { code: number; message: string }
}

export class MCPClient {
  private endpoint: string
  private requestId = 0

  constructor(mcpUrl: string) {
    this.endpoint = mcpUrl
  }

  async callTool<T = string>(name: string, args?: Record<string, unknown>): Promise<T | null> {
    const id = String(++this.requestId)

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name, arguments: args ?? {} },
        }),
      })

      if (!res.ok) return null

      const text = await res.text()
      const textContent = this.extractSSEData(text)
      if (!textContent) return null

      const parsed = JSON.parse(textContent) as MCPResponse
      if (parsed.error) {
        console.error(`[MCP] Tool ${name} error:`, parsed.error.message)
        return null
      }

      const content = parsed.result?.content
      if (!content || content.length === 0) return null

      const resultText = content.find(c => c.type === 'text')?.text
      if (!resultText) return null

      return JSON.parse(resultText) as T
    } catch (err) {
      console.error(`[MCP] callTool ${name} error:`, err)
      return null
    }
  }

  private extractSSEData(text: string): string | null {
    for (const event of text.split('\n\n')) {
      const dataLine = event.split('\n').find(l => l.startsWith('data: '))
      if (dataLine) return dataLine.slice(6)
    }
    return null
  }
}
