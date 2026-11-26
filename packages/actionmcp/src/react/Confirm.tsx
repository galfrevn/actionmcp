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
  extra: 'not in the schema',
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
  margin: '0.75rem 0 0',
  padding: '0.5rem',
  border: '1px solid GrayText',
  borderRadius: '0.375rem',
  font: '0.75rem/1.4 ui-monospace, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const fieldsStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', margin: 0 }

const fieldNameStyle: CSSProperties = { fontWeight: 600 }

const fieldValueStyle: CSSProperties = { margin: 0 }

const longValueStyle: CSSProperties = { margin: 0, maxHeight: '6rem', overflow: 'auto' }

const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }

const buttonStyle: CSSProperties = { padding: '0.375rem 0.875rem', font: 'inherit', cursor: 'pointer' }

const LONG_VALUE_LENGTH = 160
const LONG_VALUE_LINES = 4

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function isLong(text: string): boolean {
  return text.length > LONG_VALUE_LENGTH || text.split('\n').length > LONG_VALUE_LINES
}

function Value({ value, as: Element }: { value: unknown; as: 'dd' | 'div' }): ReactNode {
  const text = formatValue(value)
  return isLong(text) ? (
    <Element tabIndex={0} style={longValueStyle}>
      {text}
    </Element>
  ) : (
    <Element style={fieldValueStyle}>{text}</Element>
  )
}

function orderFields(input: Record<string, unknown>, properties: Record<string, unknown> | undefined): string[] {
  const names = Object.keys(input)
  if (!properties) return names
  const declared = Object.keys(properties).filter((name) => Object.hasOwn(input, name))
  return [...declared, ...names.filter((name) => !Object.hasOwn(properties, name))]
}

function fieldLabel(name: string, properties: Record<string, unknown> | undefined, extra: string): string {
  if (!properties) return name
  if (!Object.hasOwn(properties, name)) return `${name} (${extra})`
  const property = properties[name]
  return isRecord(property) && typeof property.title === 'string' && property.title.trim() ? property.title : name
}

function InputSummary({ input, inputSchema, extra }: { input: unknown; inputSchema: JsonSchema | undefined; extra: string }): ReactNode {
  if (!isRecord(input)) return <Value value={input} as="div" />
  const properties = isRecord(inputSchema?.properties) ? inputSchema.properties : undefined
  return (
    <dl style={fieldsStyle}>
      {orderFields(input, properties).map((name) => (
        <Fragment key={name}>
          <dt style={fieldNameStyle}>{fieldLabel(name, properties, extra)}</dt>
          <Value value={input[name]} as="dd" />
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
        <div role="group" aria-label={text.input} data-actionmcp-confirm-input="" style={inputStyle}>
          <InputSummary input={call.input} inputSchema={inputSchema} extra={text.extra} />
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
