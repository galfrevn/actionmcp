import {
  createMCPClient,
  Experimental_WebMCPTransport as WebMCPTransport,
  type Experimental_WebMCPModelContext as WebMCPModelContext,
  type MCPClient,
} from '@ai-sdk/mcp'

type ToolDefinitions = Awaited<ReturnType<MCPClient['listTools']>>['tools']
type ToolResult = Awaited<ReturnType<MCPClient['callTool']>>

export class PageTools {
  #client: MCPClient | undefined
  #generation = 0

  async connect(): Promise<boolean> {
    const generation = ++this.#generation
    const modelContext = document.modelContext as WebMCPModelContext | undefined
    if (!modelContext) {
      throw new Error('WebMCP is not available in this browser.')
    }
    const client = await createMCPClient({ transport: new WebMCPTransport({ modelContext }) })
    if (generation !== this.#generation) {
      await client.close()
      return false
    }
    this.#client = client
    return true
  }

  async list(): Promise<ToolDefinitions> {
    const listed = await this.#client?.listTools()
    return listed?.tools ?? []
  }

  call(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    if (!this.#client) {
      throw new Error('The page tools are not connected.')
    }
    return this.#client.callTool({ name, arguments: input })
  }

  close(): void {
    this.#generation += 1
    void this.#client?.close()
    this.#client = undefined
  }
}
