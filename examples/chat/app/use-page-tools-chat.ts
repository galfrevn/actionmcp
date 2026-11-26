'use client'

import {
  createMCPClient,
  Experimental_WebMCPTransport as WebMCPTransport,
  type Experimental_WebMCPModelContext as WebMCPModelContext,
  type MCPClient,
} from '@ai-sdk/mcp'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'

export function usePageToolsChat(api: string) {
  const client = useRef<MCPClient>(undefined)
  const [ready, setReady] = useState(false)
  const [setupError, setSetupError] = useState<string>()

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api,
        async prepareSendMessagesRequest({ messages }) {
          const listed = await client.current?.listTools()
          return { body: { messages, tools: listed?.tools ?? [] } }
        },
      }),
    [api],
  )

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (!toolCall.dynamic || !client.current) return
      const { toolName: tool, toolCallId } = toolCall
      try {
        const output = await client.current.callTool({ name: tool, arguments: toolCall.input as Record<string, unknown> })
        void chat.addToolOutput({ tool, toolCallId, output })
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error)
        void chat.addToolOutput({ tool, toolCallId, state: 'output-error', errorText })
      }
    },
  })

  useEffect(() => {
    const modelContext = document.modelContext as WebMCPModelContext | undefined
    if (!modelContext) {
      setSetupError('WebMCP is not available in this browser.')
      return
    }
    let active = true
    let connected: MCPClient | undefined
    void createMCPClient({ transport: new WebMCPTransport({ modelContext }) }).then(
      (mcpClient) => {
        if (!active) {
          void mcpClient.close()
          return
        }
        connected = mcpClient
        client.current = mcpClient
        setReady(true)
      },
      (error: unknown) => setSetupError(error instanceof Error ? error.message : String(error)),
    )
    return () => {
      active = false
      if (client.current === connected) client.current = undefined
      void connected?.close()
    }
  }, [])

  return { ...chat, ready, setupError }
}
