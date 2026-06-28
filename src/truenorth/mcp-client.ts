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
    const label = args ? `${name}(${JSON.stringify(args).slice(0, 60)})` : name

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

      if (!res.ok) {
        console.error(`[MCP] ${label} HTTP ${res.status}`)
        return null
      }

      const text = await res.text()
      const textContent = this.extractSSEData(text)
      if (!textContent) {
        console.error(`[MCP] ${label} no SSE data`)
        return null
      }

      const parsed = JSON.parse(textContent) as MCPResponse
      if (parsed.error) {
        console.error(`[MCP] ${label} RPC error: ${parsed.error.message}`)
        return null
      }

      const content = parsed.result?.content
      if (!content || content.length === 0) {
        console.error(`[MCP] ${label} empty content`)
        return null
      }

      const resultText = content.find(c => c.type === 'text')?.text
      if (!resultText) {
        console.error(`[MCP] ${label} no text content`)
        return null
      }

      const parsedResult = JSON.parse(resultText)
      return parsedResult as T
    } catch (err) {
      console.error(`[MCP] ${label} exception:`, err)
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
