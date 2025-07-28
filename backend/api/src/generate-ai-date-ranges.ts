import { HOUR_MS } from 'common/util/time'
import { track } from 'shared/analytics'
import { models, promptGeminiParsingJson } from 'shared/helpers/gemini'
import { log } from 'shared/utils'
import {
  assertMidpointsAreAscending,
  assertMidpointsAreUnique,
} from './generate-ai-numeric-ranges'
import { APIHandler } from './helpers/endpoint'
import { rateLimitByUser } from './helpers/rate-limit'
// Shared guidelines for both threshold and bucket ranges
// Base system prompt template that both threshold and bucket prompts will use

type DateRangeResponse = {
  answers: string[]
  midpoints: string[]
}

const baseDateSystemPrompt = (type: 'buckets' | 'thresholds') => {
  return `
    You are a helpful AI assistant that generates date ranges for prediction market questions.
    
    GUIDLINES:
    - Generate 2-12 ranges that cover the entire span from start to end
    - Err on the side of fewer (3-5) ranges when possible
    - Do NOT generate more than 12 ranges
    - Today's date is ${new Date().toISOString()}
    - Each range should have a midpoint value for expected value calculations
    - The midpoints should be dates that represent the exact middle date of the range.
    - Return the ranges and associated midpoints in ascending order
    ${
      type === 'buckets'
        ? '- If the min/max is a year/month/day and the max-min < 10 just use single years/months/days as buckets.'
        : `- If the min/max is a year/month/day and the max-min < 10 just use single 'before year/ before month/ before day' as thresholds.`
    }
    - ONLY return a single JSON object without any other text or formatting:
    {
      answers: array of range strings,
      midpoints: array of corresponding midpoint dates
    }
    ${type === 'buckets' ? bucketExamples : thresholdExamples}
`
}

const bucketExamples = `
EXAMPLES:
  Question: If convicted, when will SBF serve time? (min: 2025, max: 2028)
  {
    "answers": ["2025", "2026", "2027", "2028"],
    "midpoints": ["2025-07-02", "2026-07-02", "2027-07-02", "2028-07-02"]
  }

  Question: When will the next US recession begin? (min: Q1 2025, max: Q4 2026)
  {
    "answers": ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"],
    "midpoints": ["2025-02-14", "2025-05-14", "2025-08-14", "2025-11-14", "2026-02-14", "2026-05-14", "2026-08-14", "2026-11-14"]
  }

  Question: When will SpaceX complete its first crewed Mars mission? (min: 2025, max: 2035)
  {
    "answers": ["2025", "2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033", "2034", "2035"],
    "midpoints": ["2025-07-02", "2026-07-02", "2027-07-02", "2028-07-02", "2029-07-02", "2030-07-02", "2031-07-02", "2032-07-02", "2033-07-02", "2034-07-02", "2035-07-02"]
  }

  Question: When will artificial general intelligence be achieved? (min: 2025, max: 2035)
  {
    "answers": ["2025", "2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033", "2034", "2035"],
    "midpoints": ["2025-07-02", "2026-07-02", "2027-07-02", "2028-07-02", "2029-07-02", "2030-07-02", "2031-07-02", "2032-07-02", "2033-07-02", "2034-07-02", "2035-07-02"]
  }
`

const thresholdExamples = `
EXAMPLES:
  Question: If convicted, when will SBF start serving time? (min: 2025, max: 2028)
  {
    "answers": ["Before 2026", "Before 2027", "Before 2028", "Before 2029"],
    "midpoints": ["2025-07-02", "2026-07-02", "2027-07-02", "2028-07-02"]
  }

  Question: When will the next US recession begin? (min: Q1 2025, max: Q4 2026)
  {
    "answers": ["Before Q1 2025", "Before Q2 2025", "Before Q3 2025", "Before Q4 2025", "Before Q1 2026", "Before Q2 2026", "Before Q3 2026", "Before Q4 2026"],
    "midpoints": ["2025-02-14", "2025-05-14", "2025-08-14", "2025-11-14", "2026-02-14", "2026-05-14", "2026-08-14", "2026-11-14"]
  }

  Question: When will SpaceX complete its first crewed Mars mission? (min: 2026, max: 2035)
  {
    "answers": ["Before 2027", "Before 2028", "Before 2029", "Before 2030", "Before 2031", "Before 2032", "Before 2033", "Before 2034", "Before 2035"],
    "midpoints": ["2026-07-02", "2027-07-02", "2028-07-02", "2029-07-02", "2030-07-02", "2031-07-02", "2032-07-02", "2033-07-02", "2034-07-02", "2035-07-02"]
  }

  Question: When will artificial general intelligence be achieved? (min: 2025, max: 2035)
  {
    "answers": ["Before 2026", "Before 2027", "Before 2028", "Before 2029", "Before 2030", "Before 2031", "Before 2032", "Before 2033", "Before 2034", "Before 2035"],
    "midpoints": ["2026-07-02", "2027-07-02", "2028-07-02", "2029-07-02", "2030-07-02", "2031-07-02", "2032-07-02", "2033-07-02", "2034-07-02", "2035-07-02"]
  }
`

const giveTimeExample = () => `The current time is ${new Date().toISOString()}`

const userPrompt = (
  question: string,
  min: string,
  max: string,
  description?: string
) => {
  return `Question: ${question} ${
    description && description !== '<p></p>'
      ? `\nDescription: ${description}`
      : ''
  }\nStart: ${min} End: ${max} ${giveTimeExample()}`
}

export const generateAIDateRanges: APIHandler<'generate-ai-date-ranges'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, min, max, description } = props

      const prompt = userPrompt(question, min, max, description)

      // Prepare system prompts
      const bucketSystemPrompt = baseDateSystemPrompt('buckets')
      const thresholdSystemPrompt = baseDateSystemPrompt('thresholds')

      // Generate both bucket and threshold ranges in parallel
      const [buckets, thresholds] = await Promise.all([
        promptGeminiParsingJson<DateRangeResponse>(prompt, {
          model: models.flash,
          system: bucketSystemPrompt,
        }),
        promptGeminiParsingJson<DateRangeResponse>(prompt, {
          model: models.flash,
          system: thresholdSystemPrompt,
        }),
      ])

      // Process bucket results
      const convertedBuckets = {
        ...buckets,
        midpoints: convertDateMidpointsToTimes(buckets.midpoints),
      }
      assertMidpointsAreUnique(convertedBuckets.midpoints)
      assertMidpointsAreAscending(convertedBuckets.midpoints)
      log('buckets', convertedBuckets)

      // Process threshold results
      const convertedThresholds = {
        ...thresholds,
        midpoints: convertDateMidpointsToTimes(thresholds.midpoints),
      }
      assertMidpointsAreUnique(convertedThresholds.midpoints)
      assertMidpointsAreAscending(convertedThresholds.midpoints)
      log('thresholds', convertedThresholds)

      track(auth.uid, 'generate-ai-date-ranges', {
        question,
      })

      return {
        buckets: convertedBuckets,
        thresholds: convertedThresholds,
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )

export const regenerateDateMidpoints: APIHandler<'regenerate-date-midpoints'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, description, answers, min, max, tab } = props

      const prompt = `${userPrompt(
        question,
        min,
        max,
        description
      )}\nRanges: ${answers.join(', ')}.
      Generate appropriate midpoint dates for each range.
      RULES:
      - The midpoints should be the exact middle date of the range.
      Here are examples of the answers and their midpoints:
      ${tab === 'buckets' ? bucketExamples : thresholdExamples}
      I want you to generate midpoints given the answers, drawing on the examples above.
      Unlike the above examples, however, I do not want the answers, I just want the midpoints.
      Only return dates, never words, i.e. do not return 'never', just pick a date that fits the range.
      Return ONLY an array of midpoint dates, one for each range, without any other text or formatting.
      DO NOT return the answer array, JUST THE MIDPOINTS.
      `

      const result = await promptGeminiParsingJson<string[]>(prompt, {
        model: models.flash,
      })
      log('claudeResponse', result)

      track(auth.uid, 'regenerate-date-midpoints', {
        answers,
      })

      const convertedMidpoints = convertDateMidpointsToTimes(result)

      assertMidpointsAreUnique(convertedMidpoints)
      assertMidpointsAreAscending(convertedMidpoints)

      return { midpoints: convertedMidpoints }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )

const convertDateMidpointsToTimes = (midpoints: string[]) => {
  return midpoints.map((midpoint) => {
    const date = new Date(midpoint)
    return date.valueOf()
  })
}
