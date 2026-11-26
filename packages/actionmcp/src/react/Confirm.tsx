'use client'

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import type { ConfirmProps } from './context'

const dialogStyle: CSSProperties = {
  maxWidth: 'min(28rem, calc(100vw - 2rem))',
  padding: '1.25rem',
  border: '1px solid GrayText',
  borderRadius: '0.75rem',
  font: '0.875rem/1.5 system-ui, sans-serif',
  colorScheme: 'light dark',
  color: 'CanvasText',
  background: 'Canvas',
}

const inputStyle: CSSProperties = {
  maxHeight: '12rem',
  margin: '0.75rem 0',
  padding: '0.5rem',
  overflow: 'auto',
  border: '1px solid GrayText',
  borderRadius: '0.375rem',
  font: '0.75rem/1.4 ui-monospace, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }

const buttonStyle: CSSProperties = { padding: '0.375rem 0.875rem', font: 'inherit', cursor: 'pointer' }

export function ConfirmDialog({ call, title, description, onConfirm, onCancel }: ConfirmProps): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      data-actionmcp-confirm={call.name}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      style={dialogStyle}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id={`${id}-title`} style={{ margin: 0, fontSize: '1rem' }}>
        Allow “{title ?? call.name}”?
      </h2>
      <p id={`${id}-description`} style={{ margin: '0.5rem 0 0' }}>
        An agent wants to run this action. {description}
      </p>
      <pre tabIndex={0} role="group" aria-label="Action input" style={inputStyle}>
        {JSON.stringify(call.input, null, 2)}
      </pre>
      <div style={actionsStyle}>
        <button type="button" autoFocus style={buttonStyle} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={buttonStyle} onClick={onConfirm}>
          Allow
        </button>
      </div>
    </dialog>
  )
}
