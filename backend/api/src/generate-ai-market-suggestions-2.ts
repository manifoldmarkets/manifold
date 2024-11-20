import { APIError, APIHandler } from './helpers/endpoint'
import { models, promptClaude } from 'shared/helpers/claude'
import { AIGeneratedMarket } from 'common/contract'
import { log } from 'shared/utils'
import {
  claudeSystemPrompt,
  guidelinesPrompt,
} from 'common/ai-creation-prompts'
import { anythingToRichText } from 'shared/tiptap'
import { track } from 'shared/analytics'
import {
  largePerplexityModel,
  smallPerplexityModel,
} from 'shared/helpers/perplexity'
export const generateAIMarketSuggestions2: APIHandler<
  'generate-ai-market-suggestions-2'
> = async (props, auth) => {
  const { prompt, existingTitles } = props
  log('Prompt:', prompt)

  // Add existing titles to the prompt if provided
  const fullPrompt = existingTitles?.length
    ? `${prompt}\n\nPlease suggest new market ideas that are different from these ones:\n${existingTitles
        .map((t) => `- ${t}`)
        .join('\n')}`
    : prompt

  const perplexityResponse = await perplexity(prompt, {
    model: largePerplexityModel,
  })

  const { messages, citations } = perplexityResponse
  log('Perplexity response:', messages.join('\n'))
  log('Sources:', citations.join('\n'))

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
    ${fullPrompt}


    Now, suggest approximately 6 ideas for prediction markets as valid JSON objects that abide by the following Manifold Market schema. Each object should include:
    - question (string with 120 characters or less, required)
      - Question should be worded as a statement, i.e. Stock price of Tesla above $420 by x date, not Will the stock price of Tesla be above $420 by x date?
    - descriptionMarkdown (markdown string, required)
      - The description should be a concise summary of the market's context, possible outcomes, sources, and resolution criteria.
      - Use any references provided in the References section in the description. Format them with a references header and a bulleted list
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
        promptVersion: 2,
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
    regenerate: !!existingTitles,
  })

  return parsedMarkets
}

const perplexitySystemPrompt = `You are a helpful assistant that uses the internet to research all relevant information to a user's prompt and supplies the user with as much information as possible.`
export const perplexity = async (
  query: string,
  options: { model?: string } = {}
) => {
  const apiKey = process.env.PERPLEXITY_API_KEY
  const { model = smallPerplexityModel } = options
  const requestOptions = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: perplexitySystemPrompt,
        },
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.2,
      return_citations: true,
    }),
  }

  try {
    const response = await fetch(
      'https://api.perplexity.ai/chat/completions',
      requestOptions
    )
    const data = await response.json()

    // Extract citations if they exist
    const citations = data.citations || []

    // Map the choices and attach only referenced citations
    const messages = data.choices.map(
      (choice: any) => choice.message.content
    ) as string[]

    return { messages, citations }
  } catch (err) {
    console.error(err)
    throw new APIError(500, 'Failed to generate markets')
  }
}
