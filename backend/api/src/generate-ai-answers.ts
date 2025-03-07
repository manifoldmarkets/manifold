import { APIError, APIHandler } from './helpers/endpoint'
import { track } from 'shared/analytics'
import { perplexity } from 'shared/helpers/perplexity'
import { models, promptClaudeParsingJson } from 'shared/helpers/claude'
import {
  addAnswersModeDescription,
  multiChoiceOutcomeTypeDescriptions,
} from 'common/ai-creation-prompts'
import { log } from 'shared/utils'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'

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
      log('generateAIAnswers prompt question', question)
      const outcomeKey = shouldAnswersSumToOne
        ? 'DEPENDENT_MULTIPLE_CHOICE'
        : 'INDEPENDENT_MULTIPLE_CHOICE'
      try {
        // First use perplexity to research the topic
        const { messages, citations } = await perplexity(prompt, {
          systemPrompts: [
            `You are a helpful AI assistant that researches information to help generate possible answers for a multiple choice question.`,
          ],
        })

        const perplexityResponse =
          [messages].join('\n') + '\n\nSources:\n' + citations.join('\n\n')

        // Then use Claude to generate the answers
        const systemPrompt = `
    You are a helpful AI assistant that generates possible answers for multiple choice prediction market questions.
    The question type is ${outcomeKey}.
    ${multiChoiceOutcomeTypeDescriptions}
    
    Guidelines:
    - Generate 2-20 possible answers based on the research${
      answersString.length
        ? ` and the user's suggested answers: ${answersString}`
        : ''
    }, as well as a recommended addAnswersMode
    - Answers should be concise and clear
    - The addAnswersMode should be one of the following:
    ${addAnswersModeDescription}
    ${
      answersString.length
        ? `- Do NOT repeat any of the user's suggested answers, but DO match the style, idea, and range (if numeric) of the user's suggested answers, e.g. return answers of type 11-20, 21-30, etc. if the user suggests 1-10, or use 3-letter months if they suggest Feb, Mar, Apr, etc.`
        : ''
    }
    - ONLY return a single JSON object with "answers" string array and "addAnswersMode" string. Do not return anything else.
    
    Here is current information from the internet that is related to the question:
    ${perplexityResponse}
    `

        const claudePrompt = `${prompt}\n\nReturn ONLY a JSON object containing "answers" string array and "addAnswersMode" string.`

        const result = await promptClaudeParsingJson<{
          answers: string[]
          addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
        }>(claudePrompt, {
          model: models.sonnet,
          system: systemPrompt,
        })
        log('claudeResponse', result)

        track(auth.uid, 'generate-ai-answers', {
          question,
        })

        return result
      } catch (e) {
        console.error('Failed to generate answers:', e)
        throw new APIError(500, 'Failed to generate answers. Please try again.')
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )
