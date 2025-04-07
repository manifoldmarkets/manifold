import { APIError, APIHandler, AuthedUser } from './helpers/endpoint'
import { AIGeneratedMarket } from 'common/contract'
import { log } from 'shared/utils'
import { formattingPrompt, guidelinesPrompt } from 'common/ai-creation-prompts'
import { anythingToRichText } from 'shared/tiptap'
import { track } from 'shared/analytics'
import { scrapeUrl } from './helpers/crawl'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'
import { promptOpenAIParseJson } from 'shared/helpers/openai-utils'
import { APIParams } from 'common/api/schema'

export const generateSuggestions = async (
  props: APIParams<'generate-ai-market-suggestions'>,
  auth: AuthedUser
) => {
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

  const combinedPrompt = `
    You are a helpful assistant that suggests ideas for engaging prediction markets on Manifold Markets based on a user's prompt.
    Your role is to take the user's prompt and transform it into 6 well-structured prediction markets that encourage participation and meaningful forecasting.
    Use your own knowledge and web search capabilities if necessary to gather relevant information.
    Today is ${new Date().toISOString()}
    ${guidelinesPrompt}

    Here is the user's prompt, potentially including content scraped from URLs:
    ${promptIncludingUrlContent}

    ${formattingPrompt}

    ONLY return a valid JSON array of market objects and do NOT include any other text.
  `

  const response = await promptOpenAIParseJson<AIGeneratedMarket[]>(
    combinedPrompt
  )

  // Parse the JSON response
  let parsedMarkets: AIGeneratedMarket[] = []
  try {
    parsedMarkets = response.map((market: AIGeneratedMarket) => ({
      ...market,
      description:
        anythingToRichText({
          markdown: market.descriptionMarkdown,
        }) ?? '',
      promptVersion: 1,
    }))
  } catch (e) {
    log.error('Failed to parse openai response:', { e })
    throw new APIError(
      500,
      'Failed to parse market suggestions from openai. Please try again.'
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
}

// In this version, we use Perplexity to generate market suggestions, and then refine them with Claude
export const generateAIMarketSuggestions: APIHandler<'generate-ai-market-suggestions'> =
  rateLimitByUser(generateSuggestions, { maxCalls: 60, windowMs: HOUR_MS })

// Updated regex to match both http(s) and www URLs
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/g

const extractUrls = (text: string) => {
  return text.match(URL_REGEX) || []
}
export const getContentFromPrompt = async (prompt: string) => {
  // Check if the prompt is a URL or contains URLs
  const urls = extractUrls(prompt)
  const urlToContent: Record<string, string | undefined> = Object.fromEntries(
    urls.map((url) => [url, undefined])
  )
  if (urls.length > 0) {
    try {
      // Scrape all found URLs
      const scrapeResults = await Promise.allSettled(
        urls.map((url) => scrapeUrl(url))
      )

      // Match each URL with its scraped content
      urls.forEach((url, i) => {
        const result = scrapeResults[i]
        if (result.status === 'fulfilled') {
          urlToContent[url] = result.value.markdown
        }
      })

      log('Scrape results:', urlToContent)
    } catch (e) {
      log.error('Failed to scrape URLs:', {
        error: e,
        urls,
      })
    }
  }
  // Add scraped content to the prompt if available
  const promptIncludingUrlContent = urlToContent
    ? `${prompt}\n\nWe found the following content from the provided URL(s):\n\n${Object.entries(
        urlToContent
      )
        .map(([url, content]) => `${url}:\n${content}`)
        .join('\n\n')}`
    : prompt

  return promptIncludingUrlContent
}
