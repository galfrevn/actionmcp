'use client'

import { useState } from 'react'
import { usePageToolsChat } from './use-page-tools-chat'

const SUGGESTIONS = ['What is on my list?', 'Add "Water the plants"', 'Mark "Buy coffee beans" as done']

function outcome(state: string, output: unknown): string {
  if (state === 'output-error') return 'error'
  if (state !== 'output-available') return 'waiting'
  try {
    const { content } = output as { content: Array<{ text?: unknown }> }
    const text = content.find((item) => typeof item.text === 'string')?.text
    const result = JSON.parse(String(text)) as { ok?: unknown; error?: { code?: unknown } }
    return result.ok === false ? String(result.error?.code ?? 'failed') : 'done'
  } catch {
    return 'done'
  }
}

export function Chat() {
  const { messages, sendMessage, status, error, ready, setupError } = usePageToolsChat('/api/chat')
  const [input, setInput] = useState('')
  const busy = status === 'submitted' || status === 'streaming'

  const send = (text: string) => {
    if (!ready || busy || !text.trim()) return
    setInput('')
    void sendMessage({ text: text.trim() })
  }

  return (
    <section className="chat" aria-label="Assistant">
      <h2>Assistant</h2>
      <div className="messages" data-testid="messages">
        {messages.length === 0 ? <p className="muted">Ask the assistant to read or change your todos.</p> : null}
        {messages.map((message) =>
          message.parts.map((part, index) => {
            const key = `${message.id}:${index}`
            if (part.type === 'text') {
              return (
                <p key={key} className="message" data-role={message.role}>
                  <strong>{message.role === 'user' ? 'You' : 'Assistant'}:</strong> {part.text}
                </p>
              )
            }
            if (part.type === 'dynamic-tool') {
              const result = outcome(part.state, part.state === 'output-available' ? part.output : undefined)
              return (
                <p key={key} className="tool" data-tool={part.toolName} data-state={part.state} data-outcome={result}>
                  {part.toolName} · {result}
                </p>
              )
            }
            return null
          }),
        )}
      </div>
      {setupError ? <p role="alert">{setupError}</p> : null}
      {error ? <p role="alert">{error.message}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          send(input)
        }}
      >
        <input
          value={input}
          placeholder="Message the assistant"
          aria-label="Message"
          style={{ flex: 1 }}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" disabled={!ready || busy}>
          Send
        </button>
      </form>
      <div>
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" disabled={!ready || busy} onClick={() => send(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  )
}
