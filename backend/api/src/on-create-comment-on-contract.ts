import { compact } from 'lodash'
import { isProd, log, revalidateStaticProps } from 'shared/utils'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import {
  replied_users_info,
  createAIDescriptionUpdateNotification,
} from 'shared/create-notification'
import { createCommentOnContractNotification } from 'shared/notifications/create-new-contract-comment-notif'
import {
  parseJsonContentToText,
  parseMentions,
  richTextToString,
} from 'common/util/parse'
import { Contract, contractPath } from 'common/contract'
import { User } from 'common/user'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { insertModReport } from 'shared/create-mod-report'
import { updateContract } from 'shared/supabase/contracts'
import { followContractInternal } from 'api/follow-contract'
import { getAnswer } from 'shared/supabase/answers'
import { anythingToRichText } from 'shared/tiptap'
import { getCommentsDirect } from 'shared/supabase/contract-comments'
import { updateMarketContinuation } from './update-market'
import { JSONContent } from '@tiptap/core'
import { cloneDeep } from 'lodash'
import { track } from 'shared/analytics'
import { DEV_HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { parseGeminiResponseAsJson, promptGemini } from 'shared/helpers/gemini'

type ClarificationResponse = {
  isClarification: boolean
  description?: string
}

export const onCreateCommentOnContract = async (props: {
  contract: Contract
  comment: ContractComment
  creator: User
  bet?: Bet
}) => {
  const { contract, comment, creator, bet } = props
  const pg = createSupabaseDirectClient()
  const lastCommentTime = comment.createdTime
  await updateContract(pg, contract.id, {
    lastCommentTime,
    lastUpdatedTime: Date.now(),
  })
  await revalidateStaticProps(contractPath(contract)).catch((e) =>
    log.error('Failed to revalidate contract after comment', {
      e,
      comment,
      creator,
    })
  )

  await followContractInternal(pg, contract.id, true, creator.id)

  if (
    creator.id === contract.creatorId &&
    !contract.isResolved &&
    contract.outcomeType !== 'POLL'
  ) {
    await checkForClarification(pg, contract, comment)
  }

  await handleCommentNotifications(pg, comment, contract, creator, bet)
}

const getReplyInfo = async (
  pg: SupabaseDirectClient,
  comment: ContractComment,
  contract: Contract
) => {
  if (comment.answerOutcome && contract.outcomeType === 'MULTIPLE_CHOICE') {
    const answer = await getAnswer(pg, comment.answerOutcome)
    const comments = await pg.manyOrNone<{
      user_id: string
      data: ContractComment // Need data for context
    }>(
      `select user_id, data
      from contract_comments
      where contract_id = $1 and coalesce(data->>'answerOutcome', '') = $2
      order by created_time asc`,
      [contract.id, answer?.id ?? '']
    )
    return {
      repliedToAnswer: answer,
      repliedToType: 'answer',
      repliedUserId: answer?.userId,
      commentsInSameReplyChain: comments, // Comments replying to the same answer
    } as const
  } else if (comment.replyToCommentId) {
    const comments = await pg.manyOrNone<{
      user_id: string
      data: ContractComment
    }>(
      `select user_id, data
      from contract_comments where contract_id = $1
        and (coalesce(data->>'replyToCommentId', '') = $2
            or comment_id = $2)
      order by created_time asc`,
      [contract.id, comment.replyToCommentId]
    )
    return {
      repliedToAnswer: null,
      repliedToType: 'comment',
      repliedUserId: comments.find(
        (c) => c.data.id === comment.replyToCommentId
      )?.user_id,
      commentsInSameReplyChain: comments,
    } as const
  } else {
    return null
  }
}

export const handleCommentNotifications = async (
  pg: SupabaseDirectClient,
  comment: ContractComment,
  contract: Contract,
  commentCreator: User,
  bet: Bet | undefined
) => {
  const replyInfo = await getReplyInfo(pg, comment, contract)

  const modsId = 'WQJ92QkoqDPuyj6DAZ5lR6g1x573'
  const mentionedUsers = compact(parseMentions(comment.content))
  const mentionedMods = mentionedUsers.includes(modsId)

  const repliedUsers: replied_users_info = {}
  if (replyInfo) {
    const {
      repliedToType,
      repliedUserId,
      repliedToAnswer,
      commentsInSameReplyChain,
    } = replyInfo

    // The parent of the reply chain could be a comment or an answer
    if (repliedUserId && repliedToType)
      repliedUsers[repliedUserId] = {
        repliedToType,
        repliedToAnswerText: repliedToAnswer?.text,
        repliedToAnswerId: repliedToAnswer?.id,
        bet: bet,
      }

    if (commentsInSameReplyChain) {
      // Add users from the reply chain (parent and siblings) to notifications,
      // excluding the commenter and the direct recipient (already added)
      commentsInSameReplyChain.forEach((c) => {
        if (c.user_id !== comment.userId && c.user_id !== repliedUserId) {
          repliedUsers[c.user_id] = {
            repliedToType: 'comment',
            repliedToAnswerText: undefined,
            repliedToAnswerId: undefined,
            bet: undefined,
          }
        }
      })
    }
  }
  if (mentionedMods) {
    await insertModReport(comment)
  }

  // Prepare context for Gemini check
  let threadContext: string | null = null
  let newCommentText = ''
  if (replyInfo?.commentsInSameReplyChain) {
    // Build the thread context: comments in the same chain + the new comment
    const threadComments = [
      ...replyInfo.commentsInSameReplyChain
        .filter((c) => c.data.id !== comment.id) // Filter out the new comment itself
        .map((c) => ({
          userId: c.user_id,
          userName: c.data.userName,
          userUsername: c.data.userUsername,
          content: c.data.content,
        })),
    ]

    threadContext = threadComments
      .map((c) => {
        const authorTag =
          c.userId === contract.creatorId ? '[CREATOR]' : '[USER]'
        const name = c.userName
          ? `${c.userName} (@${c.userUsername})`
          : `User ${c.userId.substring(0, 4)}`
        return `${authorTag} ${name}: ${richTextToString(c.content)}`
      })
      .join('\n---\n') // Separator between comments
  }

  // Format the new comment text
  const newCommentAuthorTag =
    comment.userId === contract.creatorId ? '[CREATOR]' : '[USER]'
  newCommentText = `${newCommentAuthorTag} ${
    commentCreator.name
      ? `${commentCreator.name} (@${commentCreator.username})`
      : `User ${commentCreator.id.substring(0, 4)}`
  }: ${richTextToString(comment.content)}`

  // Check if comment needs response using Gemini, now with context
  const checkResult =
    comment.userId === contract.creatorId
      ? { needsResponse: false }
      : await checkCommentNeedsResponse(contract, threadContext, newCommentText)
  const needsResponse = checkResult.needsResponse

  await createCommentOnContractNotification(
    comment.id,
    commentCreator,
    richTextToString(comment.content),
    contract,
    repliedUsers,
    mentionedUsers,
    needsResponse
  )
  return [...mentionedUsers, ...Object.keys(repliedUsers)]
}

const checkForClarification = async (
  pg: SupabaseDirectClient,
  contract: Contract,
  comment: ContractComment
) => {
  let commentsContext = ''
  let answerContext = ''

  if (comment.replyToCommentId) {
    const originalComment = await getCommentsDirect(pg, {
      contractId: contract.id,
      commentId: comment.replyToCommentId,
    })
    const relatedComments = await getCommentsDirect(pg, {
      contractId: contract.id,
      replyToCommentId: comment.replyToCommentId,
    })

    const replyToAnswerId =
      comment.answerOutcome ||
      originalComment.find((c) => c.answerOutcome)?.answerOutcome
    // Get answer context if this is a reply to an answer
    if (replyToAnswerId) {
      const answer = await getAnswer(pg, replyToAnswerId)
      if (answer) {
        const isCreatorAnswer = answer.userId === contract.creatorId
        answerContext = `ANSWER (submitted by ${
          isCreatorAnswer ? 'creator' : 'user'
        }) BEING DISCUSSED:
${answer.text}`
      }
    }

    commentsContext = [...originalComment, ...relatedComments]
      .filter((c) => c.id !== comment.id)
      .map((c) => {
        const isCreator = c.userId === contract.creatorId
        return `${isCreator ? 'Creator' : 'User'}: ${richTextToString(
          c.content
        )}`
      })
      .join('\n')
  }

  const closeTimeDetail = contract.closeTime
    ? `Market is set to close on ${new Date(contract.closeTime).toISOString()}`
    : ''

  const prompt = `SYSTEM: You are analyzing a ${
    commentsContext ? 'comment thread' : 'comment'
  } on a prediction market (that is managed by a creator) to determine if the creator's latest comment clarifies the resolution criteria.

CONTEXT:
Market question: ${contract.question}
${closeTimeDetail}
Market description: ${
    typeof contract.description === 'string'
      ? contract.description
      : richTextToString(contract.description)
  }

${answerContext}
${commentsContext ? `COMMENT THREAD:\n${commentsContext}` : ''}

CREATOR'S LATEST COMMENT:
${richTextToString(comment.content)}

SYSTEM: Please analyze if the creator's latest comment ${
    commentsContext ? '(in context of the comment thread)' : ''
  } is clarifying or adding important details about how the market will be resolved, that is not already covered by the market's description/question title. 
Only choose to issue a clarification if the creator's comment is unambiguously changing the resolution criteria as outlined in the description/question.
If the creator says that they're going to update the description themselves, or they indicate their comment ${
    commentsContext ? '(or their comments in the thread)' : ''
  } shouldn't be used to update the description, do not issue a clarification.

Return a JSON response with:
{
  "isClarification": boolean, // true if the comment clarifies resolution criteria
  "description": string // If isClarification is true, provide markdown formatted text to append to the current description. Use bold for important terms and bullet points for lists. Otherwise, return an empty string.
}

Format the description in markdown, sticking to just the following:
- Use **bold** for important terms
- Use bullet points for lists

I will append the title of 'Update from creator' to the beginning of the description. You do not need to include this in your response.
NOTE: If the creator explicitly states that their comment is not a clarification, such as saying "these comments are not a clarification," then you must not treat it as clarifying or changing the resolution criteria. In that case, return {"isClarification": false, "description": ""}.
Only return the raw JSON object without any markdown code blocks, backticks, additional formatting, or anything else.`

  try {
    const response = await promptGemini(prompt, {
      model: 'gemini-2.5-pro-preview-03-25',
    })
    log('Clarification response:', {
      question: contract.question,
      contractId: contract.id,
      slug: contract.slug,
      response,
    })
    if (!response) {
      log.error('No response from ai clarification')
      return
    }
    const clarification = parseGeminiResponseAsJson(
      response
    ) as ClarificationResponse

    if (clarification.isClarification && clarification.description) {
      const dateParts = new Date()
        .toLocaleDateString('en-US', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        .split('/')
      const date = `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`
      const timeZone = new Date()
        .toLocaleDateString('en-US', { timeZoneName: 'short' })
        .includes('PDT')
        ? 'PDT'
        : 'PST'

      const formattedDescription = clarification.description.replace(
        /\n[•\-*] /g,
        '\n   - '
      )
      const summaryNote = `(AI summary of [creator comment](${contractPath(
        contract
      )}#${comment.id}))`

      const markdownToAppend = `- Update ${date} (${timeZone}) ${summaryNote}: ${formattedDescription} `

      const appendDescription = anythingToRichText({
        markdown: markdownToAppend,
      })
      // Create deep copy of the old description to update history correctly
      const oldDescription = cloneDeep(contract.description)
      let newDescription: JSONContent | undefined

      if (typeof oldDescription === 'string') {
        newDescription = anythingToRichText({
          markdown: `${oldDescription}${appendDescription}`,
        })
      } else {
        oldDescription.content?.push(
          { type: 'paragraph' }, // acts as newline
          ...(appendDescription?.content ?? [])
        )
        newDescription = oldDescription
      }
      await updateContract(pg, contract.id, {
        description: newDescription,
      })
      const editorID = isProd()
        ? '8lZo8X5lewh4hnCoreI7iSc0GxK2' // ManifoldAI user id, lol
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
      await updateMarketContinuation(
        contract,
        editorID,
        undefined,
        undefined,
        undefined,
        undefined,
        newDescription
      )
      track(editorID, 'ai clarification added', {
        contractId: contract.id,
        slug: contract.slug,
        question: contract.question,
      })

      await createAIDescriptionUpdateNotification(contract, markdownToAppend)
    }
  } catch (e) {
    log.error('Error checking for clarification:', { e })
  }
}

export const checkCommentNeedsResponse = async (
  contract: Contract,
  threadContext: string | null,
  newCommentText: string
) => {
  const prompt = `
  Analyze the NEWEST COMMENT on a prediction market and determine if it requires a response from the market creator.

  The creator is a user of Manifold Markets that created the market and resolves it using their judgement, along with the title and description of the market.

  The NEWEST COMMENT should be considered as needing a response if it:
  1. Asks for clarification about the market or its resolution criteria
  2. Requests the market to be resolved
  3. Points out potential issues that need to be addressed
  4. (If relevant to the market) Requests an update on the status of the market from the creator
  5. Asks a direct question to the market creator and the question is related to the market

  Market title: ${contract.question}
  Market description: ${parseJsonContentToText(contract.description)}

  ${
    threadContext
      ? `COMMENT THREAD CONTEXT (previous messages):\n\`\`\`\n${threadContext}\n\`\`\`\nThe thread context uses [USER] and [CREATOR] tags. Discussions between users not addressing the creator should NOT be considered as needing a response.`
      : 'This is a top-level comment (not a reply).'
  }

  NEWEST COMMENT (Analyze this comment for whether a response is needed):
  \`\`\`
  ${newCommentText}
  \`\`\`

  Return a JSON object with:
  - needsResponse: boolean // True if the *newest comment* requires a response based ONLY on its content and the criteria above.
  - reason: string (brief explanation why, or empty if no response needed)

  Only return the JSON object, no other text.`

  try {
    const response = await promptGemini(prompt)
    const result = parseGeminiResponseAsJson(response)
    return result as { needsResponse: boolean; reason: string }
  } catch (error) {
    log.error(`Error checking if comment needs response: ${error}`)
    // Default to false if there's an error
    return { needsResponse: false, reason: '' }
  }
}
