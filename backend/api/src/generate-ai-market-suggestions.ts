import { APIError, APIHandler } from './helpers/endpoint'
import { largePerplexityModel, perplexity } from 'shared/helpers/perplexity'
import { models, promptClaude } from 'shared/helpers/claude'
import { AIGeneratedMarket } from 'common/contract'
import { log } from 'shared/utils'
import {
  claudeSystemPrompt,
  formattingPrompt,
  guidelinesPrompt,
} from 'common/ai-creation-prompts'
import { anythingToRichText } from 'shared/tiptap'
import { track } from 'shared/analytics'
import { scrapeUrl } from './helpers/crawl'

// In this version, we use Perplexity to generate market suggestions, and then refine them with Claude
export const generateAIMarketSuggestions: APIHandler<
  'generate-ai-market-suggestions'
> = async (props, auth) => {
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
    model: largePerplexityModel,
  })

  const { messages, citations } = perplexityResponse
  log('Perplexity response:', messages.join('\n'))
  log('Sources:', citations.join('\n'))

  // Format the perplexity suggestions for Claude
  const claudePrompt = `  
    ${formattingPrompt}

    Please review the market suggestions and refine them according to the following guidelines:
    ${guidelinesPrompt}
    
    Here is the original user's prompt:
    ${promptIncludingUrlContent}
    
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
        promptVersion: 1,
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
    hasScrapedContent:
      promptIncludingUrlContent !== promptIncludingTitlesToIgnore,
  })

  return parsedMarkets
}

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
