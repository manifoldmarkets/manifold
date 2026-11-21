import { log } from 'shared/utils'
import { ClaudeEffort, models as claudeModels, promptClaude } from './claude'
import {
  GeminiThinkingLevel,
  models as geminiModels,
  parseAIResponseAsJson,
  promptGemini,
} from './gemini'
import { models as openaiModels, promptOpenAI } from './openai-utils'

export type { GeminiThinkingLevel }

type ReasoningEffort = 'low' | 'medium' | 'high'

// Which tier to reach for (prices per 1M tokens, Oct 2026):
//   haiku      Claude Haiku 5.5       $0.10 / $0.50   classification, extraction,
//                                                     short JSON — the default
//   flashLite  Gemini 3.5 Flash-Lite  $0.30 / $2.50   the same jobs when they also
//                                                     need Google Search grounding
//   flash      Gemini 3.8 Flash       $0.75 / $3.75   grounded generation and the
//                                                     creator-clarification check
//   gpt, gptMini  GPT-6 Sol / Luna    $2 / $10, $0.10 / $0.50   bounty summaries
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
  // Gemini-specific thinking level. If not specified but reasoning.effort is,
  // it will be mapped to an equivalent thinking level for Gemini models.
  // 'minimal' is a Flash-Lite level; promptGemini clamps it to 'low' on Flash
  // and Claude maps it to 'low' effort.
  thinkingLevel?: GeminiThinkingLevel
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

// Gemini thinking levels and Claude effort levels describe the same dial;
// 'minimal' has no Claude equivalent, so it maps to the lowest effort.
export const effortFromThinkingLevel = (
  level: GeminiThinkingLevel | undefined
): ClaudeEffort | undefined =>
  level === undefined ? undefined : level === 'minimal' ? 'low' : level

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
  const { model, system, webSearch, reasoning, thinkingLevel } = options
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
    const effort = reasoning?.effort ?? effortFromThinkingLevel(thinkingLevel)
    try {
      rawResponse = await promptClaude(prompt, {
        model: model as any,
        system,
        webSearch,
        effort,
      })
      // Parsing belongs inside the attempt: malformed JSON is a failed
      // classification too, and should use the same fallback as API errors.
      return options.parseAsJson
        ? (parseAIResponseAsJson(rawResponse) as T)
        : rawResponse
    } catch (error) {
      // Everything routed to Claude is a classification whose Gemini
      // equivalent simply costs more; none of it is a feature that may be
      // unavailable. If Anthropic is down, rate-limiting, refusing, or the
      // key has no credit, answer from Flash-Lite at the matching thinking
      // level instead of degrading silently. Logged as an error so it can be
      // alerted on: a sustained stream of these means the cheap tier is off.
      log.error('Claude call failed, falling back to Gemini Flash-Lite', {
        model,
        effort,
        error,
      })
      rawResponse = await promptGemini(prompt, {
        model: geminiModels.flashLite,
        system,
        webSearch,
        thinkingLevel: thinkingLevel ?? reasoning?.effort,
      })
    }
  } else {
    // For Gemini, use explicit thinkingLevel if provided, otherwise map from reasoning.effort
    const geminiThinkingLevel: GeminiThinkingLevel | undefined =
      thinkingLevel ?? reasoning?.effort
    rawResponse = await promptGemini(prompt, {
      model: model as any,
      system,
      webSearch,
      thinkingLevel: geminiThinkingLevel,
    })
  }

  if ('parseAsJson' in options && options.parseAsJson) {
    return parseAIResponseAsJson(rawResponse) as T
  }
  return rawResponse
}
