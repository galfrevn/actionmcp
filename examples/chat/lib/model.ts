import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'

const MODEL_ID = process.env.AI_MODEL ?? 'anthropic/claude-sonnet-5.5'

export function resolveModel(): LanguageModel {
  const { OPENROUTER_API_KEY } = process.env
  return OPENROUTER_API_KEY ? createOpenRouter({ apiKey: OPENROUTER_API_KEY }).chat(MODEL_ID) : MODEL_ID
}
