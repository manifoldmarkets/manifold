import { HOUR_MS } from 'common/util/time'
import { track } from 'shared/analytics'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { rateLimitByUser } from './helpers/rate-limit'

const baseSystemPrompt = (style: 'threshold' | 'bucket') => {
  const belowAbovePrompt =
    style === 'bucket'
      ? `- When it makes sense, include "Below min" and "Above max" ranges (with appropriate midpoints) in the answers array`
      : ''
  return `
    You are a helpful AI assistant that generates ${style} numeric ranges for prediction market questions.
    Today is ${new Date().toISOString()}.

    GUIDLINES:
    - Generate 2-12 (Maximum 12) ranges that cover the entire span from min to max
    - Err on the side of fewer (4-6) ranges when possible
    - Favor human-friendly ranges like:
      * Round numbers
      * Decimal precision when appropriate
      * Smaller ranges for more precision when values are likely to be close
    - Each range should have a midpoint value for expected value calculations
    - Return the ranges and associated midpoints in ascending order
    - For log scale ranges (i.e. ranges like 1-100, 100-1000, 1000-10000, or above 10, above 100, above 1000, etc.), use the geometric mean for the midpoints.
    ${belowAbovePrompt}
    - ONLY return a single JSON object without any other text or formatting:
    {
      answers: array of range strings,
      midpoints: array of corresponding midpoint numbers
    }
    ${style === 'threshold' ? thresholdExamples : bucketExamples}

    - Remember, DO NOT return more than 12 answers.
`
}

export const generateAINumericRanges: APIHandler<'generate-ai-numeric-ranges'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, min, max, description, unit } = props
      const prompt = userPrompt(question, min, max, unit, description)

      const thresholdSystemPrompt = baseSystemPrompt('threshold')

      const bucketSystemPrompt = baseSystemPrompt('bucket')

      const [thresholds, buckets] = await Promise.all([
        promptAI<RangeResponse>(prompt, {
          model: aiModels.sonnet4,
          system: thresholdSystemPrompt,
          parseAsJson: true,
        }),
        promptAI<RangeResponse>(prompt, {
          model: aiModels.sonnet4,
          system: bucketSystemPrompt,
          parseAsJson: true,
        }),
      ])

      log('thresholds', thresholds)
      log('buckets', buckets)

      assertMidpointsAreUnique(thresholds.midpoints)
      assertMidpointsAreAscending(thresholds.midpoints)

      assertMidpointsAreUnique(buckets.midpoints)
      assertMidpointsAreAscending(buckets.midpoints)

      // Format bucket answers to add spaces around the dash
      buckets.answers = formatBucketAnswers(buckets.answers)

      track(auth.uid, 'generate-ai-numeric-ranges', {
        question,
      })

      return {
        thresholds,
        buckets,
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )

export const regenerateNumericMidpoints: APIHandler<'regenerate-numeric-midpoints'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, description, answers, min, max, unit, tab } = props
      log('midpoints from answers', { answers })
      if (answers.every((answer) => answer.trim() === '')) {
        throw new APIError(400, 'No ranges provided')
      }
      const prompt = `${userPrompt(
        question,
        min,
        max,
        unit,
        description
      )}\nRanges: ${answers.join(', ')}.
      Generate appropriate midpoints for each range. 
      RULES:
      - The midpoints should be numbers that represent the expected value for each range.
      - If the range is a log scale, use the geometric mean for the midpoint.

      ${tab === 'thresholds' ? thresholdExamples : bucketExamples}

      Return ONLY an array of midpoint numbers, one for each range, in the same order as the ranges, without any other text or formatting.`

      const result = await promptAI<number[]>(prompt, {
        model: aiModels.sonnet4,
        parseAsJson: true,
      })
      log('claudeResponse', result)

      track(auth.uid, 'regenerate-numeric-midpoints', {
        answers,
      })

      assertMidpointsAreUnique(result)
      assertMidpointsAreAscending(result)

      return { midpoints: result }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )

const thresholdExamples = `
EXAMPLES:
  Question: The Joker rotten tomatoes score (min: 50, max: 100): 
  {
    "answers": ["Above 50", "Above 60", "Above 70", "Above 75", "Above 80", "Above 85", "Above 90", "Above 95"],
    "midpoints": [55, 65, 72.5, 77.5, 82.5, 87.5, 92.5, 97.5]
  }
  Question: Snow in NYC this month (inches) (min: 0, max: 20): 
  {
    "answers": ["Above 0", "Above 2", "Above 4", "Above 6", "Above 8", "Above 10", "Above 12", "Above 14", "Above 16", "Above 18"],
    "midpoints": [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  }
  Question: How many times will Elon post on X this week? (min: 300, max: 800)
  {
    "answers": ["Above 300", "Above 400", "Above 500", "Above 600", "Above 700"],
    "midpoints": [350, 450, 550, 650, 750]
  }
  Question: How many h5n1 bird flu cases will be confirmed in the US in 2025? (min: 0, max: 100,000)
  {
    "answers": ["Above 0", "Above 100", "Above 1,000", "Above 10,000", "Above 100,000"],
    "midpoints": [31.6, 316, 3162, 31623, 316228]
  }
  Question: How many goals will be scored in the World Cup final? (min: 0, max: 10)
  {
    "answers": ["Above 0", "Above 2", "Above 4", "Above 6", "Above 8"],
    "midpoints": [1.5, 3.5, 5.5, 7.5, 9.5]
  }
  Question: How many Americans will die as a result of commercial air travel accidents in 2025? (min: 0, max: 10000)
  {
    "answers": ["Above 0", "Above 100", "Above 1,000", "Above 10,000"],
    "midpoints": [31.6, 316, 3162, 31623]
  }   
  Question: How large will Trump's EU tariffs be? (min: 0, max: 50)
  {
    "answers": ["Above 0%", "Above 10%", "Above 20%", "Above 30%", "Above 40%", "Above 50%"],
    "midpoints": [ 5, 15, 25, 35, 45, 55]
  }
`

const bucketExamples = `
EXAMPLES:
  Question: The Joker rotten tomatoes score (min: 45, max: 100): 
  {
    "answers": ["Below 45", "45-54", "55-64", "65-74", "75-84", "85-94", "95-100"],
    "midpoints": [40, 50, 60, 70, 80, 90, 97.5]
  }
  Question: Snow in NYC this month (inches) (min: 0, max: 20): 
  {
    "answers": ["0-1.9", "2-3.9", "4-5.9", "6-7.9", "8-9.9", "10-11.9", "12-13.9", "14-15.9", "16-17.9", "18-20", "Above 20"],
    "midpoints": [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 25]
  }
  Question: How many times will Elon post on X this week? (min: 300, max: 800)
  {
    "answers": ["Below 300", "300-399", "400-499", "500-599", "600-699", "700-799", "800+"],
    "midpoints": [250, 350, 450, 550, 650, 750, 900]
  }
  Question: How many h5n1 bird flu cases will be confirmed in the US in 2025? (min: 0, max: 100,000)
  {
    "answers": ["0-99", "100-999", "1,000-9,999", "10,000-99,999", "100,000+"],
    "midpoints": [31.6, 316, 3162, 31623, 316228]
  }
  Question: How many goals will be scored in the World Cup final? (min: 0, max: 11)
  {
    "answers": ["0-2", "3-5", "6-8", "9-11", "Above 11"],
    "midpoints": [1, 4, 7, 10, 13]
  }
  Question: If convicted, when will SBF serve time? (min: 2025, max: 2028)
  {
    "answers": ["Before 2025", "2025", "2026", "2027", "2028", "After 2028"],
    "midpoints": [2024.5, 2025.5, 2026.5, 2027.5, 2028.5, 2029.5]
  }
  Question: How many Americans will die as a result of commercial air travel accidents in 2025? (min: 0, max: 10000)
  {
    "answers": ["0-100", "100-499", "500-999", "1000-4999", "5000-9999", "10000+"],
    "midpoints": [31.6, 299, 749, 2999, 7499, 15000]
  }
  Question: How large will Trump's EU tariffs be? (min: 0, max: 50)
  {
    "answers": ["0-9.99%", "10-19.99%", "20-29.99%", "30-39.99%", "40-49.99%", "Above 50%"],
    "midpoints": [5, 15, 25, 35, 45, 55]
  }
`

const userPrompt = (
  question: string,
  min: number,
  max: number,
  unit: string,
  description?: string
) => {
  return `Question: ${question} ${
    description && description !== '<p></p>'
      ? `\nDescription: ${description}`
      : ''
  }\nMin: ${min} Max: ${max} Unit: ${unit}`
}

export const assertMidpointsAreUnique = (midpoints: number[]) => {
  const unique = new Set(midpoints).size === midpoints.length
  if (!unique) {
    throw new APIError(500, 'Answer ranges are not unique. Try again.')
  }
}

export const assertMidpointsAreAscending = (midpoints: number[]) => {
  for (let i = 1; i < midpoints.length; i++) {
    if (midpoints[i] <= midpoints[i - 1]) {
      throw new APIError(
        500,
        'Answer ranges are not in ascending order. Try again.'
      )
    }
  }
}

export type RangeResponse = {
  answers: string[]
  midpoints: number[]
}

const formatBucketAnswers = (answers: string[]): string[] => {
  return answers.map((answer) => {
    if (answer.includes('-')) {
      return answer.replace(/-/g, ' - ')
    }
    return answer
  })
}
