import { APIError, APIHandler } from './helpers/endpoint'
import { log } from 'shared/utils'
import { track } from 'shared/analytics'
import { anythingToRichText } from 'shared/tiptap'
import { perplexity } from 'shared/helpers/perplexity'
import { models, promptClaude } from 'shared/helpers/claude'
import {
  addAnswersModeDescription,
  outcomeTypeDescriptions,
} from 'common/ai-creation-prompts'
import { HOUR_MS } from 'common/util/time'
import { rateLimitByUser } from './helpers/rate-limit'

export const generateAIDescription: APIHandler<'generate-ai-description'> =
  rateLimitByUser(
    async (props, auth) => {
      const {
        question,
        description,
        answers,
        outcomeType,
        shouldAnswersSumToOne,
        addAnswersMode,
      } = props
      const includeAnswers =
        answers &&
        answers.length > 0 &&
        outcomeType &&
        ['MULTIPLE_CHOICE', 'POLL'].includes(outcomeType)
      const outcomeKey =
        outcomeType == 'MULTIPLE_CHOICE'
          ? shouldAnswersSumToOne
            ? 'DEPENDENT_MULTIPLE_CHOICE'
            : 'INDEPENDENT_MULTIPLE_CHOICE'
          : outcomeType

      const userQuestionAndDescription = `Question: ${question} ${
        description && description !== '<p></p>'
          ? `\nDescription: ${description}`
          : ''
      } ${includeAnswers ? `\nMaybe: ${answers.join(', ')}` : ''}
  `

      log('Generating AI description for:', userQuestionAndDescription)
      try {
        const { messages, citations } = await perplexity(
          userQuestionAndDescription,
          {
            systemPrompts: [
              `You are a helpful AI assistant that researches information about the user's prompt`,
            ],
          }
        )
        const perplexityResponse =
          [messages].join('\n') + '\n\nSources:\n' + citations.join('\n\n')

        const systemPrompt = `
    You are a helpful AI assistant that generates detailed descriptions for prediction markets. Your goal is to provide relevant context, background information, and clear resolution criteria that will help traders make informed predictions.
    ${
      outcomeKey
        ? `Their market is of type ${outcomeKey}\n${outcomeTypeDescriptions}`
        : ''
    }
    ${
      addAnswersMode
        ? `\nThe user has specified that the addAnswersMode is ${addAnswersMode}\n${addAnswersModeDescription}`
        : ''
    }
    Guidelines:
    - Keep descriptions concise but informative
    - Incorporate any relevant information from the user's description into your own description
    - If the user supplied answers, provide any relevant background information for each answer
    - If the market is personal, (i.e. I will attend the most parties, or I will get a girlfriend) word resolution criteria in the first person
    - Include relevant sources and data when available
    - Clearly state how the market will be resolved
    - Try to think of likely edge cases that traders should be aware of, mention them in the description and how the market will be resolved in those cases
    - Don't repeat the question in the description
    - Focus on objective facts rather than opinions
    - If the market has a precondition, such as 'If I attend, will I enjoy the party?', or 'If Biden runs, will he win?', markets should resolve N/A if the precondition is not met
    - Format the response as markdown
    - Include a "Background" section that includes information readers/traders may want to know if it's relevant to the user's question AND it's not common knowledge. Keep it concise.
    - Include a "Resolution criteria" section that describes how the market will be resolved. Include any special resolution criteria for likely edge cases.
    - Only include a "Considerations" section if there are unexpected considerations that traders may want to know about. E.g. if the question is about something that has never happened before, etc. ${
      addAnswersMode === 'DISABLED' &&
      outcomeKey === 'DEPENDENT_MULTIPLE_CHOICE'
        ? 'E.g. if the answers are not exhaustive, traders should be warned that the market may resolve N/A.'
        : ''
    }
    - Here is current information from the internet that is related to the user's prompt. Include information from it in the description that traders or other readers may want to know if it's relevant to the user's question:
    ${perplexityResponse}
    `

        const prompt = `${userQuestionAndDescription}\n\n Only return the markdown description, nothing else`
        const claudeResponse = await promptClaude(prompt, {
          model: models.sonnet,
          system: systemPrompt,
        })

        track(auth.uid, 'generate-ai-description', {
          question,
          hasExistingDescription: !!description,
        })

        return { description: anythingToRichText({ markdown: claudeResponse }) }
      } catch (e) {
        console.error('Failed to generate description:', e)
        throw new APIError(
          500,
          'Failed to generate description. Please try again.'
        )
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )
