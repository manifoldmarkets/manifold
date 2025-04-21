import { APIHandler } from './helpers/endpoint'
import { generateSuggestions } from './generate-ai-market-suggestions'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'

// In this version, we use Perplexity to generate context for the prompt, and then Claude to generate market suggestions
export const generateAIMarketSuggestions2: APIHandler<'generate-ai-market-suggestions-2'> =
  rateLimitByUser(generateSuggestions, { maxCalls: 60, windowMs: HOUR_MS })
