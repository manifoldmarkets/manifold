import { APIHandler } from './helpers/endpoint'
import { track } from 'shared/analytics'
import {
  models,
  promptClaude,
  promptClaudeParsingJson,
} from 'shared/helpers/claude'
import { log } from 'shared/utils'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'
import {
  assertMidpointsAreAscending,
  assertMidpointsAreUnique,
  RangeResponse,
} from './generate-ai-numeric-ranges'
// Shared guidelines for both threshold and bucket ranges
// Base system prompt template that both threshold and bucket prompts will use

const baseDateSystemPrompt = () => {
  return `
    You are a helpful AI assistant that generates date ranges for prediction market questions.
    
    GUIDLINES:
    - Generate 2-12 ranges that cover the entire span from start to end
    - Err on the side of fewer (3-5) ranges when possible
    - Favor human-friendly ranges like:
      * Round numbers
      * Smaller ranges for more precision when values are likely to be close
    - Each range should have a midpoint value for expected value calculations
    - Return the ranges and associated midpoints in ascending order
    - If the unit is a year/month/day and the max-min < 10 just use single years/months/days as buckets.
    - If the unit is a unit of time, the midpoint should be the ms from now to the target date.
    - ONLY return a single JSON object without any other text or formatting:
    {
      answers: array of range strings,
      midpoints: array of corresponding midpoint numbers
    }
    ${bucketExamples}
`
}

const bucketExamples = `
EXAMPLES:
  Question: If convicted, when will SBF serve time? (min: 2025, max: 2028)
  {
    "answers": ["2025", "2026", "2027", "2028"],
    "midpoints": [2025.5, 2026.5, 2027.5, 2028.5]
  }
`

const giveTimeExample = () =>
  `The current time is ${new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`

const userPrompt = (
  question: string,
  min: string,
  max: string,
  unit: string,
  description?: string
) => {
  return `Question: ${question} ${
    description && description !== '<p></p>'
      ? `\nDescription: ${description}`
      : ''
  }\nStart: ${min} End: ${max} Unit: ${unit} ${giveTimeExample()}`
}

export const generateAIDateRanges: APIHandler<'generate-ai-date-ranges'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, min, max, description, unit } = props

      const prompt = userPrompt(question, min, max, unit, description)

      const bucketSystemPrompt = baseDateSystemPrompt()

      const buckets = await promptClaudeParsingJson<RangeResponse>(prompt, {
        model: models.sonnet,
        system: bucketSystemPrompt,
      })

      assertMidpointsAreUnique(buckets.midpoints)
      assertMidpointsAreAscending(buckets.midpoints)
      buckets.midpoints = convertTimeMidpointsToDates(unit, buckets.midpoints)
      log('buckets', buckets)
      track(auth.uid, 'generate-ai-date-ranges', {
        question,
      })

      return {
        buckets,
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )

export const regenerateDateMidpoints: APIHandler<'regenerate-date-midpoints'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, description, answers, min, max, unit } = props

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

      ${bucketExamples}

      Return ONLY an array of midpoint numbers, one for each range, without any other text or formatting.`

      const result = await promptClaudeParsingJson<number[]>(prompt, {
        model: models.sonnet,
      })
      log('claudeResponse', result)

      track(auth.uid, 'regenerate-numeric-midpoints', {
        answers,
      })

      assertMidpointsAreUnique(result)
      assertMidpointsAreAscending(result)

      return { midpoints: convertTimeMidpointsToDates(unit, result) }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )

const convertTimeMidpointsToDates = (unit: string, midpoints: number[]) => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const currentDay = now.getDate()

  return midpoints.map((midpoint) => {
    if (unit.trim().toLowerCase() === 'year') {
      // For years, calculate milliseconds from now to the target year point
      const targetYear = Math.floor(midpoint)
      const fraction = midpoint - targetYear

      // Create date for the target year (same month/day as today)
      const targetDate = new Date(targetYear, currentMonth, currentDay)

      // Add the fraction of the year in milliseconds if there is one
      if (fraction > 0) {
        const millisecondsInYear = 365.25 * 24 * 60 * 60 * 1000
        const additionalMilliseconds = Math.floor(fraction * millisecondsInYear)
        targetDate.setTime(targetDate.getTime() + additionalMilliseconds)
      }

      // Return milliseconds from now to target date
      // If target is in the past, we'll return a small positive value (1 day)
      const msDiff = targetDate.getTime() - now.getTime()
      return msDiff > 0 ? msDiff : 24 * 60 * 60 * 1000 // Return at least 1 day if in past
    } else if (unit.trim().toLowerCase() === 'month') {
      // For months, add the number of months to current date
      const targetDate = new Date(
        currentYear,
        currentMonth + midpoint,
        currentDay
      )
      const msDiff = targetDate.getTime() - now.getTime()
      return msDiff > 0 ? msDiff : 24 * 60 * 60 * 1000
    } else if (unit.trim().toLowerCase() === 'day') {
      // For days, add the number of days to current date
      const targetDate = new Date(
        now.getTime() + midpoint * 24 * 60 * 60 * 1000
      )
      const msDiff = targetDate.getTime() - now.getTime()
      return msDiff > 0 ? msDiff : 24 * 60 * 60 * 1000
    } else {
      // Fallback for any other time unit
      return midpoint
    }
  })
}
