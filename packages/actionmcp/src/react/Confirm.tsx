'use client'

import { Fragment, useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { isRecord } from '../core/guards'
import type { JsonSchema } from '../core/types'
import type { ConfirmLabels, ConfirmProps } from './context'

export const TOOL_PLACEHOLDER = '{tool}'

export const DEFAULT_CONFIRM_LABELS: ConfirmLabels = {
  title: `Allow “${TOOL_PLACEHOLDER}”?`,
  intro: 'An agent wants to run this action.',
  input: 'Action input',
  allow: 'Allow',
  cancel: 'Cancel',
}

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
  margin: '0.75rem 0 0',
  padding: '0.5rem',
  overflow: 'auto',
  border: '1px solid GrayText',
  borderRadius: '0.375rem',
  font: '0.75rem/1.4 ui-monospace, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const fieldsStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', margin: 0 }

const fieldNameStyle: CSSProperties = { fontWeight: 600 }

const fieldValueStyle: CSSProperties = { margin: 0 }

const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }

const buttonStyle: CSSProperties = { padding: '0.375rem 0.875rem', font: 'inherit', cursor: 'pointer' }

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function fieldLabel(name: string, inputSchema: JsonSchema | undefined): string {
  const properties = inputSchema?.properties
  const property = isRecord(properties) ? properties[name] : undefined
  return isRecord(property) && typeof property.title === 'string' && property.title.trim() ? property.title : name
}

function InputSummary({ input, inputSchema }: { input: unknown; inputSchema: JsonSchema | undefined }): ReactNode {
  if (!isRecord(input)) return formatValue(input)
  return (
    <dl style={fieldsStyle}>
      {Object.entries(input).map(([name, value]) => (
        <Fragment key={name}>
          <dt style={fieldNameStyle}>{fieldLabel(name, inputSchema)}</dt>
          <dd style={fieldValueStyle}>{formatValue(value)}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function hasInput(input: unknown): boolean {
  return isRecord(input) ? Object.keys(input).length > 0 : input !== undefined && input !== null
}

export function ConfirmDialog({ call, title, description, inputSchema, labels, onConfirm, onCancel }: ConfirmProps): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const id = useId()
  const text = { ...DEFAULT_CONFIRM_LABELS, ...labels }

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    cancelButton.current?.focus()
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
        {text.title.replaceAll(TOOL_PLACEHOLDER, title ?? call.name)}
      </h2>
      <p id={`${id}-description`} style={{ margin: '0.5rem 0 0' }}>
        {text.intro} {description}
      </p>
      {hasInput(call.input) ? (
        <div tabIndex={0} role="group" aria-label={text.input} data-actionmcp-confirm-input="" style={inputStyle}>
          <InputSummary input={call.input} inputSchema={inputSchema} />
        </div>
      ) : null}
      <div style={actionsStyle}>
        <button ref={cancelButton} type="button" style={buttonStyle} onClick={onCancel}>
          {text.cancel}
        </button>
        <button type="button" style={buttonStyle} onClick={onConfirm}>
          {text.allow}
        </button>
      </div>
    </dialog>
  )
}
