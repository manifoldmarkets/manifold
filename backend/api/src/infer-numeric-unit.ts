import { APIError, APIHandler } from './helpers/endpoint'
import { track } from 'shared/analytics'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'
import { promptGemini, parseGeminiResponseAsJson } from 'shared/helpers/gemini'
import { log } from 'shared/utils'

export const inferNumericUnit: APIHandler<'infer-numeric-unit'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, description } = props

      try {
        const systemPrompt = `
      You are an AI assistant that extracts the most appropriate unit of measurement from prediction market questions.
      You will return ONLY a JSON object with a single "unit" field containing the inferred unit as a string.
      For example: {"unit": "people"}
      
      Guidelines:
      - If no specific unit is mentioned, infer the most logical unit based on the context
      - Common units include: people, $, $bn, $m, $k, %, points, votes, etc.
      - If the question is about a count of items, use the plural form (e.g., "people" not "person")
      - If no unit can be reasonably inferred, return an empty json object
      `

        const prompt = `
      Question: ${question}
      ${
        description && description !== '<p></p>'
          ? `Description: ${description}`
          : ''
      }
      `
        const response = await promptGemini(prompt, { system: systemPrompt })
        const result = parseGeminiResponseAsJson(response)
        log.info('Inferred unit:', { result })

        track(auth.uid, 'infer-numeric-unit', {
          question,
          inferred_unit: result.unit,
        })

        return { unit: result.unit }
      } catch (error) {
        log.error('Error inferring unit:', { error })
        throw new APIError(500, 'Failed to infer unit from question')
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )
