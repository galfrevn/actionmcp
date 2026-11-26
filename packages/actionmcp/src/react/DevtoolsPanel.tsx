'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { WebMCP } from 'webmcp-types'
import { subscribeToToolCalls, type ToolCallRecord } from '../core/events'
import { getWebMCPStatus, whenModelContextAvailable, type ModelContext, type WebMCPStatus } from '../core/webmcp'

const HISTORY_LIMIT = 50

const STATUS_LABELS: Record<WebMCPStatus, string> = {
  native: 'WebMCP: native',
  polyfill: 'WebMCP: polyfill (native agents do not see these tools)',
  unavailable: 'WebMCP unavailable',
}

const styles = {
  toggle: {
    position: 'fixed',
    right: '1rem',
    bottom: '1rem',
    zIndex: 2147483646,
    padding: '0.375rem 0.75rem',
    border: '1px solid GrayText',
    borderRadius: '999px',
    font: '0.75rem/1.4 system-ui, sans-serif',
    color: 'CanvasText',
    background: 'Canvas',
    cursor: 'pointer',
  },
  panel: {
    position: 'fixed',
    right: '1rem',
    bottom: '3.5rem',
    zIndex: 2147483646,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    width: 'min(26rem, calc(100vw - 2rem))',
    maxHeight: 'min(36rem, calc(100vh - 5rem))',
    padding: '0.75rem',
    overflow: 'auto',
    border: '1px solid GrayText',
    borderRadius: '0.75rem',
    font: '0.75rem/1.5 system-ui, sans-serif',
    colorScheme: 'light dark',
    color: 'CanvasText',
    background: 'Canvas',
  },
  heading: { margin: 0, fontSize: '0.75rem', fontWeight: 600 },
  code: {
    margin: 0,
    padding: '0.375rem',
    maxHeight: '10rem',
    overflow: 'auto',
    border: '1px solid GrayText',
    borderRadius: '0.375rem',
    font: '0.6875rem/1.4 ui-monospace, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  tool: { display: 'block', width: '100%', padding: '0.25rem 0.375rem', font: 'inherit', textAlign: 'left', cursor: 'pointer' },
  input: { width: '100%', minHeight: '4rem', boxSizing: 'border-box', font: '0.6875rem/1.4 ui-monospace, monospace' },
} satisfies Record<string, CSSProperties>

function describeAnnotations(annotations: WebMCP.ToolAnnotations | null): string {
  const labels = [
    annotations?.readOnlyHint ? 'read-only' : undefined,
    annotations?.consequentialHint ? 'consequential' : undefined,
    annotations?.untrustedContentHint ? 'untrusted output' : undefined,
  ].filter(Boolean)
  return labels.length > 0 ? labels.join(', ') : 'no annotations'
}

function format(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

export function DevtoolsPanel(): ReactNode {
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<ModelContext>()
  const [status, setStatus] = useState<WebMCPStatus>('unavailable')
  const [tools, setTools] = useState<readonly WebMCP.Tool[]>([])
  const [selectedName, setSelectedName] = useState<string>()
  const [input, setInput] = useState('{}')
  const [output, setOutput] = useState<string>()
  const [history, setHistory] = useState<readonly ToolCallRecord[]>([])

  useEffect(() => {
    const controller = new AbortController()
    void whenModelContextAvailable(controller.signal).then((available) => {
      if (!available) return
      const refresh = () => {
        void available.getTools().then((registered) => {
          if (!controller.signal.aborted) setTools(registered)
        })
      }
      available.addEventListener('toolchange', refresh, { signal: controller.signal })
      setContext(available)
      setStatus(getWebMCPStatus())
      refresh()
    })
    const unsubscribe = subscribeToToolCalls((record) => setHistory((records) => [record, ...records].slice(0, HISTORY_LIMIT)))
    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [])

  const selected = tools.find((tool) => tool.name === selectedName)

  const run = async (tool: WebMCP.Tool) => {
    if (!context) return
    try {
      setOutput('Running…')
      setOutput(await context.executeTool(tool, JSON.parse(input) as object))
    } catch (error) {
      setOutput(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    }
  }

  return (
    <>
      <button
        type="button"
        data-actionmcp-devtools="toggle"
        aria-expanded={open}
        style={styles.toggle}
        onClick={() => setOpen((value) => !value)}
      >
        Agent tools · {tools.length}
      </button>
      {open ? (
        <section data-actionmcp-devtools="panel" aria-label="Agent tools devtools" style={styles.panel}>
          <p data-actionmcp-devtools="status" style={styles.heading}>
            {STATUS_LABELS[status]}
          </p>
          <h2 style={styles.heading}>Registered tools</h2>
          {tools.length === 0 ? <p style={{ margin: 0 }}>No tools are registered on this page.</p> : null}
          {tools.map((tool) => (
            <button
              key={`${tool.origin}:${tool.name}`}
              type="button"
              aria-pressed={tool.name === selectedName}
              style={styles.tool}
              onClick={() => {
                setSelectedName(tool.name)
                setOutput(undefined)
              }}
            >
              <strong>{tool.name}</strong> · {describeAnnotations(tool.annotations)}
            </button>
          ))}
          {selected ? (
            <>
              <p style={{ margin: 0 }}>{selected.description}</p>
              <pre style={styles.code}>{format(selected.inputSchema ?? 'No input schema')}</pre>
              <label>
                <span style={styles.heading}>Input (JSON)</span>
                <textarea value={input} spellCheck={false} style={styles.input} onChange={(event) => setInput(event.target.value)} />
              </label>
              <button type="button" data-actionmcp-devtools="run" onClick={() => void run(selected)}>
                Run {selected.name}
              </button>
              {output === undefined ? null : (
                <pre data-actionmcp-devtools="output" style={styles.code}>
                  {output}
                </pre>
              )}
            </>
          ) : null}
          <h2 style={styles.heading}>Call history</h2>
          {history.length === 0 ? <p style={{ margin: 0 }}>No calls yet.</p> : null}
          {history.map((record) => (
            <details key={`${record.startedAt}:${record.name}`} data-actionmcp-devtools="call">
              <summary>
                {record.name} · {record.durationMs} ms · confirmation {record.confirmation}
                {record.cancelled ? ' · cancelled by the agent' : ''}
              </summary>
              <pre style={styles.code}>{format({ input: record.input, result: record.result })}</pre>
            </details>
          ))}
        </section>
      ) : null}
    </>
  )
}
