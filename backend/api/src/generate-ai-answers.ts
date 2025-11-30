import {
  addAnswersModeDescription,
  multiChoiceOutcomeTypeDescriptions,
} from 'common/ai-creation-prompts'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { HOUR_MS } from 'common/util/time'
import { track } from 'shared/analytics'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { rateLimitByUser } from './helpers/rate-limit'

export const generateAIAnswers: APIHandler<'generate-ai-answers'> =
  rateLimitByUser(
    async (props, auth) => {
      const { question, shouldAnswersSumToOne, description, answers } = props
      const answersString = answers.filter(Boolean).join(', ')
      const prompt = `Question: ${question} ${
        description && description !== '<p></p>'
          ? `\nDescription: ${description}`
          : ''
      } ${
        answersString.length
          ? `\nHere are my suggested answers: ${answersString}`
          : ''
      }`
      log('generateAIAnswers prompt:', prompt)
      const outcomeKey = shouldAnswersSumToOne
        ? 'DEPENDENT_MULTIPLE_CHOICE'
        : 'INDEPENDENT_MULTIPLE_CHOICE'
      try {
        const userPrompt = `
  You are a helpful AI assistant that generates answers for prediction market questions.
  Today is ${new Date().toISOString()}.
  ${prompt}

  Generate 2-20 possible answers for the above multiple choice prediction market question${
    answersString.length
      ? ` considering the user's suggested answers: ${answersString}`
      : ''
  }.
  The question type is ${outcomeKey}.
  ${multiChoiceOutcomeTypeDescriptions}
  The addAnswersMode should be one of the following: ${addAnswersModeDescription}.
  ${
    answersString.length
      ? `Do NOT repeat any of the user's suggested answers, but DO match the style, idea, and range (if numeric) of the user's suggested answers, e.g. return answers of type 11-20, 21-30, etc. if the user suggests 1-10, or use 3-letter months if they suggest Feb, Mar, Apr, etc.`
      : ''
  }
  IMPORTANT: Each answer must be ${MAX_ANSWER_LENGTH} characters or less. Keep answers concise and to the point.
  Return ONLY a JSON object containing "answers" string array and "addAnswersMode" string. Do not include ANY other explanatory text, conversational filler, or markdown formatting.

  Example output:
  {
    "answers": ["answer 1", "answer 2", "answer 3"],
    "addAnswersMode": "ANYONE"
  }
  `

        const result = await promptAI<{
          answers: string[]
          addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
        }>(userPrompt, {
          model: aiModels.haiku,
          webSearch: true,
          parseAsJson: true,
        })

        // Truncate any answers that exceed the character limit
        const truncatedAnswers = result.answers.map((answer) =>
          answer.length > MAX_ANSWER_LENGTH
            ? answer.substring(0, MAX_ANSWER_LENGTH)
            : answer
        )

        track(auth.uid, 'generate-ai-answers', {
          question: question.substring(0, 100),
        })

        return {
          ...result,
          answers: truncatedAnswers,
        }
      } catch (e) {
        log.error('Failed to generate answers:', { e })
        throw new APIError(500, 'Failed to generate answers. Please try again.')
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )
