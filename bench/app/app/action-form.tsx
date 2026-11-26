'use client'

import { useActionState, type ReactNode } from 'react'
import type { ActionState } from './actions'

interface ActionFormProps {
  action: (previousState: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  children: ReactNode
}

export function ActionForm({ action, submitLabel, children }: ActionFormProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})
  return (
    <form action={formAction}>
      {children}
      <button type="submit" disabled={pending}>
        {submitLabel}
      </button>
      {state.error ? <span role="alert">{state.error}</span> : null}
      {state.success ? <span role="status">{state.success}</span> : null}
    </form>
  )
}
