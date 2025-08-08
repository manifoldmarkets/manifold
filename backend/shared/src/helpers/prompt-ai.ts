import { models as claudeModels, promptClaude } from './claude'
import {
  models as geminiModels,
  parseAIResponseAsJson,
  promptGemini,
} from './gemini'
import { models as openaiModels, promptOpenAI } from './openai-utils'

type ReasoningEffort = 'low' | 'medium' | 'high'

export const aiModels = {
  ...openaiModels,
  ...claudeModels,
  ...geminiModels,
} as const

export type PromptAIOptionsBase = {
  model: (typeof aiModels)[keyof typeof aiModels]
  system?: string
  webSearch?: boolean
  reasoning?: { effort: ReasoningEffort }
}

export type PromptAIJsonOptions = PromptAIOptionsBase & { parseAsJson: true }
export type PromptAIStringOptions = PromptAIOptionsBase & {
  parseAsJson?: false
}

function getProviderFromModel(
  model: (typeof aiModels)[keyof typeof aiModels]
): 'openai' | 'claude' | 'gemini' {
  const lower = model.toLowerCase()
  if (lower.startsWith('claude')) return 'claude'
  if (lower.startsWith('gemini')) return 'gemini'
  return 'openai'
}

export async function promptAI<T>(
  prompt: string,
  options: PromptAIJsonOptions
): Promise<T>
export async function promptAI(
  prompt: string,
  options: PromptAIStringOptions
): Promise<string>
export async function promptAI<T = unknown>(
  prompt: string,
  options: (PromptAIJsonOptions | PromptAIStringOptions) & {
    model: (typeof aiModels)[keyof typeof aiModels]
  }
): Promise<string | T> {
  const { model, system, webSearch, reasoning } = options
  const provider = getProviderFromModel(model)

  let rawResponse: string

  if (provider === 'openai') {
    rawResponse = await promptOpenAI(prompt, {
      model: model as any,
      system,
      reasoning,
      webSearch,
    })
  } else if (provider === 'claude') {
    rawResponse = await promptClaude(prompt, {
      model: model as any,
      system,
      webSearch,
    })
  } else {
    rawResponse = await promptGemini(prompt, { model: model as any, system })
  }

  if ('parseAsJson' in options && options.parseAsJson) {
    return parseAIResponseAsJson(rawResponse) as T
  }
  return rawResponse
}
