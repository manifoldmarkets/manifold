import { HOUR_MS } from 'common/util/time'
import { track } from 'shared/analytics'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { rateLimitByUser } from './helpers/rate-limit'

export const checkPollSuggestion: APIHandler<'check-poll-suggestion'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, answers } = props
      const answersString = answers?.filter(Boolean).join(', ') || ''

      log('checkPollSuggestion:', { question, answersString })

      const prompt = `You are an expert at determining whether a question is objective (has a verifiable factual answer) or subjective (based on opinions, preferences, or personal judgment).

Today is ${new Date().toISOString()}.

Question: "${question}"
${answersString ? `Possible answers: ${answersString}` : ''}

Analyze this question and determine:
1. Is this question OBJECTIVE (can be verified with facts, has a definite answer that will be known in the future) or SUBJECTIVE (based on opinions, preferences, or personal judgment)?

Examples of OBJECTIVE questions (should be prediction markets):
- "Will Biden win the 2024 election?" - factually verifiable outcome
- "Will SpaceX launch Starship by 2025?" - factually verifiable event
- "Will the S&P 500 close above 5000 on Dec 31?" - measurable outcome
- "Which team will win the Super Bowl?" - factually verifiable
- "When will GPT-5 be released?" - factually verifiable date

Examples of SUBJECTIVE questions (should be polls):
- "What is the best programming language?" - opinion-based
- "Who is the greatest basketball player of all time?" - subjective judgment
- "What's your favorite movie?" - personal preference
- "Is pineapple good on pizza?" - matter of taste
- "What do you think about AI art?" - personal opinion
- "Which political party has better policies?" - value judgment
- "Is remote work better than office work?" - depends on personal circumstances

Return ONLY a JSON object with:
- "isSubjective": boolean (true if the question is subjective/opinion-based, false if objective/factual)
- "confidence": number between 0 and 1 (how confident you are in this classification)
- "reason": string (brief explanation, max 100 characters)

Only suggest a poll (isSubjective: true) when you're reasonably confident the question is asking for opinions or preferences rather than predictions about future events.`

      try {
        const result = await promptAI<{
          isSubjective: boolean
          confidence: number
          reason: string
        }>(prompt, {
          model: aiModels.haiku,
          parseAsJson: true,
        })

        track(auth.uid, 'check-poll-suggestion', {
          question: question.substring(0, 100),
          isSubjective: result.isSubjective,
          confidence: result.confidence,
        })

        return result
      } catch (e) {
        log.error('Failed to check poll suggestion:', { e })
        throw new APIError(
          500,
          'Failed to analyze question. Please try again.'
        )
      }
    },
    { maxCalls: 120, windowMs: HOUR_MS }
  )
