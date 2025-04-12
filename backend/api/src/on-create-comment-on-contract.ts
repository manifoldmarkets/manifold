import { compact } from 'lodash'
import { isProd, log, revalidateStaticProps } from 'shared/utils'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import {
  createCommentOnContractNotification,
  replied_users_info,
  createAIDescriptionUpdateNotification,
} from 'shared/create-notification'
import { parseMentions, richTextToString } from 'common/util/parse'
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
import { promptOpenAI } from 'shared/helpers/openai-utils'

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

  await revalidateStaticProps(contractPath(contract)).catch((e) =>
    log.error('Failed to revalidate contract after comment', {
      e,
      comment,
      creator,
    })
  )

  const lastCommentTime = comment.createdTime

  await followContractInternal(pg, contract.id, true, creator.id)

  await updateContract(pg, contract.id, {
    lastCommentTime,
    lastUpdatedTime: Date.now(),
  })

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
    const comments = await pg.manyOrNone(
      `select comment_id, user_id
      from contract_comments
      where contract_id = $1 and coalesce(data->>'answerOutcome', '') = $2`,
      [contract.id, answer?.id ?? '']
    )
    return {
      repliedToAnswer: answer,
      repliedToType: 'answer',
      repliedUserId: answer?.userId,
      commentsInSameReplyChain: comments,
    } as const
  } else if (comment.replyToCommentId) {
    const comments = await pg.manyOrNone(
      `select comment_id, user_id, data->>'replyToCommentId' as reply_to_id
      from contract_comments where contract_id = $1
        and (coalesce(data->>'replyToCommentId', '') = $2
            or comment_id = $2)
      `,
      [contract.id, comment.replyToCommentId]
    )
    return {
      repliedToAnswer: null,
      repliedToType: 'comment',
      repliedUserId: comments.find(
        (c) => c.comment_id === comment.replyToCommentId
      )?.user_id,
      commentsInSameReplyChain: comments.filter(
        (c) => c.reply_to_id === comment.replyToCommentId
      ),
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
      // The rest of the children in the chain are always comments
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

  await createCommentOnContractNotification(
    comment.id,
    commentCreator,
    richTextToString(comment.content),
    contract,
    repliedUsers,
    mentionedUsers
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
    const response = await promptOpenAI(prompt, 'o3-mini')
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
    const clarification = JSON.parse(response) as ClarificationResponse

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

      const hasBulletPoints = ['\n- ', '\n• ', '\n* '].some((bullet) =>
        clarification.description?.includes(bullet)
      )
      const formattedDescription = clarification.description.replace(
        /\n[•\-*] /g,
        '\n   - '
      )
      const summaryNote = `(AI summary of [creator comment](${contractPath(
        contract
      )}#${comment.id}))`

      const markdownToAppend = hasBulletPoints
        ? `- Update ${date} (${timeZone}) ${summaryNote}: ${formattedDescription}`
        : `- Update ${date} (${timeZone}): ${formattedDescription} ${summaryNote}`

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
    console.error('Error checking for clarification:', e)
  }
}
