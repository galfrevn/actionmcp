import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'

export type ModelProvider = 'openrouter' | 'ai-gateway'

export interface ResolvedModel {
  provider: ModelProvider
  model: LanguageModel
}

export function resolveModel(id: string, env: Record<string, string | undefined> = process.env): ResolvedModel | undefined {
  if (env.OPENROUTER_API_KEY) {
    return { provider: 'openrouter', model: createOpenRouter({ apiKey: env.OPENROUTER_API_KEY }).chat(id) }
  }
  if (env.AI_GATEWAY_API_KEY) {
    return { provider: 'ai-gateway', model: id }
  }
  return undefined
}
