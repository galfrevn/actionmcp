import { isRecord } from './guards'

export function toFormData(input: unknown): FormData {
  const formData = new FormData()
  if (isRecord(input)) {
    for (const [key, value] of Object.entries(input)) {
      appendValue(formData, key, value)
    }
  }
  return formData
}

function appendValue(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null || value === false) return
  if (value === true) {
    formData.append(key, 'on')
  } else if (Array.isArray(value)) {
    for (const item of value) appendValue(formData, key, item)
  } else if (isRecord(value)) {
    formData.append(key, JSON.stringify(value))
  } else {
    formData.append(key, String(value))
  }
}
