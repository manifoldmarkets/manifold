import { APIError, APIHandler } from './helpers/endpoint'
import { log } from 'shared/utils'
import { track } from 'shared/analytics'
import { anythingToRichText } from 'shared/tiptap'
import { promptOpenAIWithWebSearch } from 'shared/helpers/openai-utils'
import {
  addAnswersModeDescription,
  outcomeTypeDescriptions,
  resolutionCriteriaPrompt,
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
        const prompt = `
        You are a helpful AI assistant that uses web search to research and generate descriptions for prediction markets. Your goal is to provide relevant context and clear resolution criteria that will help traders make informed predictions.
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
        - Keep descriptions concise but informative, focusing on objective facts rather than opinions
        - Avoid fluff, write for a high IQ audience that hates AI slop. 
        - Incorporate any relevant information from the user's description into your own description
        - If the user supplied answers, provide any relevant background information for each answer
        - If the market is personal, (i.e. I will attend the most parties, or I will get a girlfriend) word resolution criteria in the first person
        - Include only up to 3 sections and only 3 sections in the description: Resolution criteria, Background, and Considerations. Do not write anything else.
        - The "Resolution criteria" section should be the first section and describe how the market will be resolved:
        - ${resolutionCriteriaPrompt}
        - Include relevant sources and data when available from your web search
        - Don't repeat the question in the description
        - If the market has a precondition, such as 'If I attend, will I enjoy the party?', or 'If Biden runs, will he win?', markets should resolve N/A if the precondition is not met
        - Format the response as markdown
        - Also include a "Background" section that includes information readers/traders may want to know if it's relevant to the user's question AND it's not common knowledge. Keep it concise.
        - Only include a "Considerations" section if there are unexpected aspects of the question that traders may not know about E.g. if the question is about something that has never happened before, if the county uses ranked-choice voting, etc. Do NOT add fluff like 'candidates represent a range of positions and different issues matter to voters.' That's not unexpected information. ${
          addAnswersMode === 'DISABLED' &&
          outcomeKey === 'DEPENDENT_MULTIPLE_CHOICE'
            ? 'E.g. if the answers are not exhaustive, traders should be warned that the market may resolve N/A.'
            : ''
        }
        - Remember, the audience is sick of seeing AI slop, be concise and to the point.
        - Format each separate section with a #### header
        - Use your web search tool to gather relevant, up-to-date information related to the user's prompt to inform the description if necesaary. Include information from it in the description that traders or other readers may want to know if it's relevant to the user's question, but keep it concise.

        User's prompt:
        ${userQuestionAndDescription}

        Only return the markdown description, nothing else.
        `
        const gptResponse = await promptOpenAIWithWebSearch(prompt)

        track(auth.uid, 'generate-ai-description', {
          question: question.substring(0, 100),
          hasExistingDescription: !!description,
        })

        return { description: anythingToRichText({ markdown: gptResponse }) }
      } catch (e) {
        log.error('Failed to generate description:', { e })
        throw new APIError(
          500,
          'Failed to generate description. Please try again.'
        )
      }
    },
    { maxCalls: 60, windowMs: HOUR_MS }
  )
