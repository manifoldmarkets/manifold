import { JSONContent } from '@tiptap/core'
import { followContractInternal } from 'api/follow-contract'
import { DEV_HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { User } from 'common/user'
import {
  parseJsonContentToText,
  parseMentions,
  richTextToString,
} from 'common/util/parse'
import { cloneDeep, compact } from 'lodash'
import { track } from 'shared/analytics'
import { insertModReport } from 'shared/create-mod-report'
import {
  createAIDescriptionUpdateNotification,
  replied_users_info,
} from 'shared/create-notification'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import { createCommentOnContractNotification } from 'shared/notifications/create-new-contract-comment-notif'
import { getAnswer } from 'shared/supabase/answers'
import { getCommentsDirect } from 'shared/supabase/contract-comments'
import { updateContract } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { anythingToRichText } from 'shared/tiptap'
import { isProd, log, revalidateStaticProps } from 'shared/utils'
import { updateMarketContinuation } from './update-market'

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
    contract.outcomeType !== 'POLL' &&
    !conscientiousCreatorIds.includes(creator.id)
  ) {
    await checkForClarification(pg, contract, comment)
  }

  await handleCommentNotifications(pg, comment, contract, creator, bet)
}

const conscientiousCreatorIds = [
  'hqdXgp0jK2YMMhPs067eFK4afEH3', // Eliza
]

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

  const resolutionNote =
    contract.mechanism === 'cpmm-1'
      ? `If the creator is about to resolve the market and detailing their reasoning, do not try to summarize the comment. In this case, just add a note that they're about to resolve the market and to see the linked comment for more details.`
      : `If the creator is about to resolve an answer and detailing their reasoning, do not issue a clarification.`
  const prompt = `SYSTEM: You are analyzing a ${
    commentsContext ? 'comment thread' : 'comment'
  } on a prediction market on Manifold Markets (that is managed by a creator) to determine if the creator's latest comment clarifies the resolution criteria.

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
  } is clarifying or adding important details about how the market will be resolved, that is not already covered by a reasonable interpretation of the market's description/question title. 
  Here's info about how resolving a market works in Manifold Markets:
  ${ResolvingMarketsExplanation}

  The main point of a clarification is that traders understand what creator meant when creating the question, and how it will be resolved. Consider whether the provided comment might change anyone's anticipation about market outcome, as a major factor to determine if the comment is a clarification.
  ONLY choose to issue a clarification if you are CERTAIN that the creator's comment is unambiguously changing the resolution criteria as outlined in the description/question.
  By default, do not issue clarifications. Be conservative.
  Do not issue clarifications if a reasonable interpretation of the description already handles the creator's comment. 
  Do not issue clarifications for everything the creator says, only clarifications on how the market will resolve.
  Creators may close markets during periods of uncertainty about how a market will resolve, or if they don't want to put their liquidity up for grabs for live trading. Do not issue clarifications for minor close time changes. If the creator is announcing they won't support live trading, that is relatively notable and may deserve a clarification. If the creator says they're waiting to resolve for some reason, extending the resolution time in a major way, that may deserve a clarification.
  If you do not see the comment information - as happens, for example, with images/videos/Google Drive/Documents/any other links - do not interpret that as a clarification. The creator themselves will clarify as needed.
  A clarification will most likely be a response to a question from a user about how the market will resolve in x case. Liberally ignore lighthearted commentary and banter.
  ${resolutionNote}
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
Be as concise as possible. I will link your clarification to the creator's comment, so when in doubt, err on the side of brevity and let the user check out the comment for more details.
NOTE: If the creator explicitly states that their comment is not a clarification, such as saying "these comments are not a clarification," then you must not treat it as clarifying or changing the resolution criteria. In that case, return {"isClarification": false, "description": ""}.
Only return the raw JSON object without any markdown code blocks, backticks, additional formatting, or anything else.`

  try {
    const clarification = await promptAI<ClarificationResponse>(prompt, {
      model: aiModels.sonnet45,
      parseAsJson: true,
      reasoning: { effort: 'high' },
    })
    log('Clarification response:', {
      question: contract.question,
      contractId: contract.id,
      slug: contract.slug,
      clarification,
    })
    if (!clarification) {
      log.error('No response from ai clarification')
      return
    }

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
    const result = await promptAI<{ needsResponse: boolean; reason: string }>(
      prompt,
      { model: aiModels.gpt5mini, parseAsJson: true }
    )
    return result
  } catch (error) {
    log.error(`Error checking if comment needs response: ${error}`)
    // Default to false if there's an error
    return { needsResponse: false, reason: '' }
  }
}

const ResolvingMarketsExplanation = `
### How does resolving markets work?

Whoever created the market gets to resolve it! Manifold puts trust in its users to resolve their own markets in a timely and accurate manner. We encourage creators to set clear resolution criteria in advance. In exceptional circumstances, our team of moderators will overturn resolutions.

- The creator is free to use their judgment.
  - This allows for many new kinds of prediction markets to be created that are less objective. (E.g. "Will I enjoy participating in the Metaverse in 2023?")
- Market creators who are known to be reputable will earn followers, positive reviews, and more activity on their questions.
- Check out the [resolution section in the community guidelines](https://manifoldmarkets.notion.site/Community-Guidelines-f6c77b1af41749828df7dae5e8735400).

### How should I resolve a market?

Markets should be resolved in a timely fashion once the resolution conditions are met.

If a market closes and there won't be a resolution in the foreseeable future, consider editing and extending the closing date.

- For Yes/No markets it is generally recommended to resolve fully to one outcome. Only resolve to a particular probability (PARTIAL) if you have a good justification for it.
- Resolving to PARTIAL allows you to choose a specific % if you think the outcome lies between Yes and No.
- When resolving Free response and multiple choice markets, you can resolve fully to one answer, or select multiple and the % of the winnings you want to go towards each type of share.

### What does resolving to N/A do?

Resolving a market to N/A effectively cancels the market. 

This means that:

- All users who have traded on the market have their mana returned to them.
- Any user who made a profit by selling shares before resolution will have that mana subtracted from their balance. This could lead to a negative balance in some cases.
- All liquidity providers will have their mana returned to them, including the initial amount it cost to make the market.

### Closed versus resolved markets

#### Closed market

- When a market is closed, trading is halted but nothing is finalised.
- Resolution criteria for an outcome have not yet been met.
  - If the criteria have been met then write a comment @'ing the creator asking them to resolve it.
- No one can make bets.
- No one can sell out of current positions.
- The market can be edited by the creator to reopen the market and extend the close date.

#### Resolved market

- Resolution criteria for an outcome have been met.
- Creator chooses the correct answer.
- Winners are paid out and loans are taken back.
`
