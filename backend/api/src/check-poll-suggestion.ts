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

      const prompt = `You are classifying whether a prediction market question should instead be a poll.

Today is ${new Date().toISOString()}.

Question: "${question}"
${answersString ? `Possible answers: ${answersString}` : ''}

THE TEST — apply this single rule:
- OBJECTIVE: the answer becomes known through observation, counting, measurement, or a public record. A neutral third party could look at the outcome and agree on the answer. The question is OBJECTIVE even if:
  * It is about a single person, including the asker themselves ("How many presents will I get for Christmas?", "Will I run a marathon this year?", "How much will I weigh on Jan 1?")
  * Only the asker can observe the outcome ("Will I quit my job in 2026?")
  * The outcome depends on the asker's choices or luck — choices and outcomes are still facts
  * It is hard to predict, uncertain, or unusual
  * The resolution requires the creator to self-report — self-reporting is a resolution mechanism, not subjectivity

- SUBJECTIVE: answering it requires the respondent's opinion, taste, values, or aesthetic judgment. There is no outcome to observe — different people give different valid answers because they value different things.

OBJECTIVE examples (NOT polls — these are valid prediction markets):
- "Will Biden win the 2024 election?"
- "How many presents will I get for Christmas?" — countable outcome, even though personal
- "Will I get a girlfriend in 2026?" — observable outcome, even though personal
- "How many books will I read this year?" — countable outcome
- "Will it snow in NYC on Christmas Day?"
- "What will the S&P 500 close at on Dec 31?"
- "Will SpaceX launch Starship by 2026?"

SUBJECTIVE examples (polls):
- "What is the best programming language?" — pure opinion
- "Is pineapple good on pizza?" — pure taste
- "What's your favorite movie?" — pure preference
- "Should the US adopt UBI?" — value judgment, no observable resolution
- "Who is the greatest basketball player of all time?" — opinion, no objective metric
- "What do you think about AI art?" — explicitly asks for opinion

DO NOT classify a question as subjective merely because:
- It is about the asker's personal life
- It is hard to verify externally
- It depends on someone's choices
- The asker is the only person who knows the outcome
- It uses words like "I", "my", "will I"

Return ONLY a JSON object:
- "isSubjective": boolean
- "confidence": number 0-1
- "reason": string (max 100 chars, must reference the TEST above, not "personal" or "hard to verify")

Default to isSubjective: false when uncertain — a wrongly-suggested poll is worse than missing one.`

      try {
        const result = await promptAI<{
          isSubjective: boolean
          confidence: number
          reason: string
        }>(prompt, {
          model: aiModels.flash,
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
        throw new APIError(500, 'Failed to analyze question. Please try again.')
      }
    },
    { maxCalls: 120, windowMs: HOUR_MS }
  )
