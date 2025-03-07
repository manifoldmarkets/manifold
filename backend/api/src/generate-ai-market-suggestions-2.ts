import { APIError, APIHandler } from './helpers/endpoint'
import { models, promptClaudeParsingJson } from 'shared/helpers/claude'
import { AIGeneratedMarket } from 'common/contract'
import { log } from 'shared/utils'
import {
  claudeSystemPrompt,
  formattingPrompt,
  guidelinesPrompt,
} from 'common/ai-creation-prompts'
import { anythingToRichText } from 'shared/tiptap'
import { track } from 'shared/analytics'
import { perplexity, perplexityPro } from 'shared/helpers/perplexity'
import { getContentFromPrompt } from './generate-ai-market-suggestions'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'

const perplexitySystemPrompt = `You are a helpful assistant that uses the internet to research all relevant information to a user's prompt and supplies the user with as much information as possible.`
// In this version, we use Perplexity to generate context for the prompt, and then Claude to generate market suggestions
export const generateAIMarketSuggestions2: APIHandler<'generate-ai-market-suggestions-2'> =
  rateLimitByUser(
    async (props, auth) => {
      const { prompt, existingTitles } = props
      log('Prompt:', prompt)

      const promptIncludingTitlesToIgnore = existingTitles?.length
        ? `${prompt}\n\nPlease suggest new market ideas that are different from these ones:\n${existingTitles
            .map((t) => `- ${t}`)
            .join('\n')}`
        : prompt

      const promptIncludingUrlContent = await getContentFromPrompt(
        promptIncludingTitlesToIgnore
      )

      const perplexityResponse = await perplexity(promptIncludingUrlContent, {
        model: perplexityPro,
        systemPrompts: [perplexitySystemPrompt],
      })

      const { messages, citations } = perplexityResponse

      // Format the perplexity suggestions for Claude
      const claudePrompt = `  
    You are a helpful assistant that suggests ideas for engaging prediction markets on Manifold Markets.
    Your role is to take in relevant current information from the internet and transform a user's prompt into approximately 6 well-structured prediction markets that encourage participation and meaningful forecasting.
    ${guidelinesPrompt}

    Here is the current information from the internet related to the user's prompt:
    ${messages.join('\n')}
    
    ${
      citations.length > 0
        ? `Here are references to sources of the information provided, (indicated by **Source:**[#], or [#], or **Source:** [Name][#], or [1], [2], etc.).
           References:
           ${citations.join('\n')}`
        : ''
    }

    Here is the user's prompt:
    ${promptIncludingUrlContent}

    ${formattingPrompt}

    ONLY return a valid JSON array of market objects and do NOT include any other text.
  `

      const claudeResponse = await promptClaudeParsingJson<AIGeneratedMarket[]>(
        claudePrompt,
        {
          model: models.sonnet,
          system: claudeSystemPrompt,
        }
      )

      // Parse the JSON response
      let parsedMarkets: AIGeneratedMarket[] = []
      try {
        parsedMarkets = claudeResponse.map((market: AIGeneratedMarket) => ({
          ...market,
          description:
            anythingToRichText({
              markdown: market.descriptionMarkdown,
            }) ?? '',
          promptVersion: 2,
        }))
      } catch (e) {
        log.error('Failed to parse Claude response:', { e })
        throw new APIError(
          500,
          'Failed to parse market suggestions from Claude. Please try again.'
        )
      }
      track(auth.uid, 'generate-ai-market-suggestions', {
        marketTitles: parsedMarkets.map((m) => m.question),
        prompt,
        regenerate: !!existingTitles,
        hasScrapedContent:
          promptIncludingUrlContent !== promptIncludingTitlesToIgnore,
      })

      return parsedMarkets
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )
