import { APIHandler } from 'api/helpers/endpoint'
import { parseJsonContentToText } from 'common/util/parse'
import { MINUTE_MS } from 'common/util/time'
import { promptGemini } from 'shared/helpers/gemini'
import { aiModels } from 'shared/helpers/prompt-ai'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { anythingToRichText } from 'shared/tiptap'
import { log } from 'shared/utils'
import { rateLimitByIp } from './helpers/rate-limit'

export const getMarketContext: APIHandler<'get-market-context'> = rateLimitByIp(
  async (props) => {
    const { contractId } = props

    const pg = createSupabaseDirectClient()

    // Fetch the contract
    const contract = await pg.oneOrNone(
      `select question, data->'description' as description from contracts where id = $1`,
      [contractId]
    )

    if (!contract) {
      return { context: undefined }
    }

    const { question, description } = contract

    // Parse description to text
    const descriptionText = description
      ? parseJsonContentToText(description)
      : ''

    const prompt = `You are a helpful research assistant. A user is viewing a prediction market with the following prediction market:

"${question}"

${
  descriptionText
    ? `Additional context from the market description:\n"${descriptionText}"\n`
    : ''
}

Please search the internet and provide a brief, factual background on this prediction market to help users make informed predictions. Include:
- Short background on the topic
- Recent relevant developments or news
- Don't talk about 'this market', or 'this prediction market'
- If the title is clearly personal or there's no context to be found on the internet, just say 'No additional context available for this market.'

Format your response using markdown with minimal formatting (no headers) where appropriate. Keep your response to <=1 paragraph and focus on objective, verifiable information. Do not make predictions yourself.`

    try {
      const markdown = await promptGemini(prompt, {
        model: aiModels.flash,
        webSearch: true,
        thinkingLevel: 'minimal',
      })

      const richText = anythingToRichText({ markdown })

      return { context: richText }
    } catch (error) {
      log.error('Error getting market context:', { error, contractId })
      return { context: undefined }
    }
  },
  { maxCalls: 25, windowMs: MINUTE_MS }
)
