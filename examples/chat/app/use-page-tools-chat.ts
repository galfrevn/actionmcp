'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useEffect, useState } from 'react'
import { PageTools } from './page-tools'

function createSession(api: string) {
  const pageTools = new PageTools()
  const transport = new DefaultChatTransport({
    api,
    async prepareSendMessagesRequest({ messages }) {
      return { body: { messages, tools: await pageTools.list() } }
    },
  })
  return { pageTools, transport }
}

export function usePageToolsChat(api: string) {
  const [{ pageTools, transport }] = useState(() => createSession(api))
  const [ready, setReady] = useState(false)
  const [setupError, setSetupError] = useState<string>()

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (!toolCall.dynamic) return
      const { toolName: tool, toolCallId } = toolCall
      try {
        const output = await pageTools.call(tool, toolCall.input as Record<string, unknown>)
        void chat.addToolOutput({ tool, toolCallId, output })
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error)
        void chat.addToolOutput({ tool, toolCallId, state: 'output-error', errorText })
      }
    },
  })

  useEffect(() => {
    pageTools.connect().then(
      (connected) => {
        if (connected) setReady(true)
      },
      (error: unknown) => setSetupError(error instanceof Error ? error.message : String(error)),
    )
    return () => pageTools.close()
  }, [pageTools])

  return { ...chat, ready, setupError }
}
