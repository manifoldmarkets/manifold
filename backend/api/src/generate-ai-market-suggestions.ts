import { APIError, APIHandler } from './helpers/endpoint'
import { largePerplexityModel, perplexity } from 'shared/helpers/perplexity'
import { models, promptClaude } from 'shared/helpers/claude'
import { AIGeneratedMarket } from 'common/contract'
import { log } from 'shared/utils'
import {
  claudeSystemPrompt,
  guidelinesPrompt,
} from 'common/ai-creation-prompts'
import { anythingToRichText } from 'shared/tiptap'
import { track } from 'shared/analytics'

export const generateAIMarketSuggestions: APIHandler<
  'generate-ai-market-suggestions'
> = async (props, auth) => {
  const { prompt, existingTitles } = props

  // Add existing titles to the prompt if provided
  const fullPrompt = existingTitles?.length
    ? `${prompt}\n\nPlease suggest new market ideas that are different from these ones:\n${existingTitles
        .map((t) => `- ${t}`)
        .join('\n')}`
    : prompt

  const perplexityResponse = await perplexity(fullPrompt, {
    model: largePerplexityModel,
  })

  const { messages, citations } = perplexityResponse
  log('Perplexity response:', messages.join('\n'))
  log('Sources:', citations.join('\n'))

  // Format the perplexity suggestions for Claude
  const claudePrompt = `  
    Convert these prediction market ideas into valid JSON objects that abide by the following Manifold Market schema. Each object should include:
    - question (string with 120 characters or less, required)
      - Question should be worded as a statement, i.e. Stock price of Tesla above $420 by x date, not Will the stock price of Tesla be above $420 by x date?
    - descriptionMarkdown (markdown string, required)
      - The description should be a concise summary of the market's context, possible outcomes, sources, and resolution criteria.
    - closeDate (string, date in YYYY-MM-DD format, required)
      - The close date is when trading stops for the market, and resolution can be made. E.g. if the title includes 'by january 1st 2025', the close date should be 2025-12-31
    - outcomeType ("BINARY", "INDEPENDENT_MULTIPLE_CHOICE", "DEPENDENT_MULTIPLE_CHOICE", "POLL", required)
      - "BINARY" means there are only two answers, true (yes) or false (no)
      - "INDEPENDENT_MULTIPLE_CHOICE" means there are multiple answers, but they are independent of each other (e.g. What will happen during the next presidential debate?)
      - "DEPENDENT_MULTIPLE_CHOICE" means there are multiple answers, but they are dependent on each other (e.g. Who will win the presidential election?)
      - "POLL" means the question is about a personal matter, i.e. "Should I move to a new city?", "Should I get a new job?", etc.
    - answers (array of strings, recommended only if outcomeType is one of the "MULTIPLE_CHOICE" types)
    - addAnswersMode ("DISABLED", "ONLY_CREATOR", or "ANYONE", required if one of the "MULTIPLE_CHOICE" types is provided)
      - "DISABLED" means that the answers list covers all possible outcomes and no more answers can be added after the market is created
      - "ONLY_CREATOR" means that only the creator can add answers after the market is created
      - "ANYONE" means that anyone can add answers after the market is created
    - reasoning (string, required - extract the reasoning section from each market suggestion)

    Please review the market suggestions and refine them according to the following guidelines:
    ${guidelinesPrompt}
    
    Here is the original user's prompt:
    ${prompt}
    
    Here are the market suggestions to refine and convert into valid JSON objects:
    ${messages.join('\n')}

    ${
      citations.length > 0
        ? `Find any references to sources in the market suggestions, (indicated by **Source:**[#], or [#], or **Source:** [Name][#], or [1], [2], etc.), and use the following References section to append them at the end of each description. Format them with a references header and a bulleted list.
           References:
           ${citations.join('\n')}`
        : ''
    }

    ONLY return a valid JSON array of market objects and do NOT include any other text.
  `

  const claudeResponse = await promptClaude(claudePrompt, {
    model: models.sonnet,
    system: claudeSystemPrompt,
  })

  // Parse the JSON response
  let parsedMarkets: AIGeneratedMarket[] = []
  try {
    parsedMarkets = JSON.parse(claudeResponse).map(
      (market: AIGeneratedMarket) => ({
        ...market,
        description: anythingToRichText({
          markdown: market.descriptionMarkdown,
        }),
      })
    )
  } catch (e) {
    console.error('Failed to parse Claude response:', e)
    throw new APIError(
      500,
      'Failed to parse market suggestions from Claude. Please try again.'
    )
  }
  track(auth.uid, 'generate-ai-market-suggestions', {
    marketTitles: parsedMarkets.map((m) => m.question),
    prompt,
  })

  return parsedMarkets
}
