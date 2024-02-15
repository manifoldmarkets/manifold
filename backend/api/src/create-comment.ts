import * as admin from 'firebase-admin'
import { JSONContent } from '@tiptap/core'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import { FieldValue } from 'firebase-admin/firestore'
import { FLAT_COMMENT_FEE } from 'common/fees'
import { removeUndefinedProps } from 'common/util/object'
import { GCPLog, getContract, getUserFirebase } from 'shared/utils'
import { APIError, AuthedUser, type APIHandler } from './helpers/endpoint'
import { anythingToRichText } from 'shared/tiptap'
import {
  SupabaseDirectClient,
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { first } from 'lodash'
import { onCreateCommentOnContract } from './on-create-comment-on-contract'
import { millisToTs } from 'common/supabase/utils'

export const MAX_COMMENT_JSON_LENGTH = 20000

// For now, only supports creating a new top-level comment on a contract.
// Replies, posts, chats are not supported yet.
export const createComment: APIHandler<'comment'> = async (
  props,
  auth,
  { logError }
) => {
  const {
    contractId,
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
  } = props
  return createCommentOnContractInternal(contractId, auth, {
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
    logError,
  })
}

export const createCommentOnContractInternal = async (
  contractId: string,
  auth: AuthedUser,
  options: {
    content: JSONContent | undefined
    html?: string
    markdown?: string
    replyToCommentId?: string
    replyToAnswerId?: string
    replyToBetId?: string
    isRepost?: boolean
    logError: GCPLog
  }
) => {
  const firestore = admin.firestore()
  const {
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
    isRepost,
    logError,
  } = options

  const {
    you: creator,
    contract,
    contentJson,
  } = await validateComment(contractId, auth.uid, content, html, markdown)

  const pg = createSupabaseDirectClient()
  const now = Date.now()

  const bet = replyToBetId
    ? await firestore
        .collection(`contracts/${contract.id}/bets`)
        .doc(replyToBetId)
        .get()
        .then((doc) => doc.data() as Bet)
    : await getMostRecentCommentableBet(
        pg,
        contract.id,
        creator.id,
        now,
        replyToAnswerId
      )

  const position = await getLargestPosition(pg, contract.id, creator.id)

  const isApi = auth.creds.kind === 'key'

  const comment = removeUndefinedProps({
    // TODO: generate ids in supabase instead
    id: Math.random().toString(36).substring(2, 15),
    content: contentJson,
    createdTime: now,

    userId: creator.id,
    userName: creator.name,
    userUsername: creator.username,
    userAvatarUrl: creator.avatarUrl,

    // OnContract fields
    commentType: 'contract',
    contractId: contractId,
    contractSlug: contract.slug,
    contractQuestion: contract.question,
    replyToCommentId: replyToCommentId,
    answerOutcome: replyToAnswerId,
    visibility: contract.visibility,

    commentorPositionShares: position?.shares,
    commentorPositionOutcome: position?.outcome,
    commentorPositionAnswerId: position?.answer_id,
    commentorPositionProb:
      position && contract.mechanism === 'cpmm-1' ? contract.prob : undefined,

    // Response to another user's bet fields
    betId: bet?.id,
    betAmount: bet?.amount,
    betOutcome: bet?.outcome,
    betAnswerId: bet?.answerId,
    bettorName: bet?.userName,
    bettorUsername: bet?.userUsername,
    betOrderAmount: bet?.orderAmount,
    betLimitProb: bet?.limitProb,
    isApi,
    isRepost,
  } as ContractComment)

  const db = createSupabaseClient()
  const ret = await db.from('contract_comments').insert({
    contract_id: contractId,
    comment_id: comment.id,
    user_id: creator.id,
    created_time: millisToTs(now),
    data: comment,
  })

  if (ret.error) {
    throw new APIError(500, 'Failed to create comment: ' + ret.error.message)
  }

  return {
    result: comment,
    continue: async () => {
      if (isApi) {
        const userRef = firestore.doc(`users/${creator.id}`)
        await userRef.update({
          balance: FieldValue.increment(-FLAT_COMMENT_FEE),
          totalDeposits: FieldValue.increment(-FLAT_COMMENT_FEE),
        })
      }

      try {
        await onCreateCommentOnContract({ contractId, comment, creator, bet })
      } catch (e) {
        logError('Failed to run onCreateCommentOnContract: ' + e, {
          e,
          comment,
          creator,
        })
      }
    },
  }
}

export const validateComment = async (
  contractId: string,
  userId: string,
  content: JSONContent | undefined,
  html: string | undefined,
  markdown: string | undefined
) => {
  const you = await getUserFirebase(userId)
  const contract = await getContract(contractId)

  if (!you) throw new APIError(401, 'Your account was not found')
  if (you.isBannedFromPosting) throw new APIError(403, 'You are banned')
  if (you.userDeleted) throw new APIError(403, 'Your account is deleted')

  if (!contract) throw new APIError(404, 'Contract not found')

  const contentJson = content || anythingToRichText({ html, markdown })

  if (!contentJson) {
    throw new APIError(400, 'No comment content provided.')
  }

  if (JSON.stringify(contentJson).length > MAX_COMMENT_JSON_LENGTH) {
    throw new APIError(
      400,
      `Comment is too long; should be less than ${MAX_COMMENT_JSON_LENGTH} as a JSON string.`
    )
  }
  return { contentJson, you, contract }
}

async function getMostRecentCommentableBet(
  pg: SupabaseDirectClient,
  contractId: string,
  userId: string,
  commentCreatedTime: number,
  answerOutcome?: string
) {
  const maxAge = '5 minutes'
  const bet = await pg
    .map(
      `with prior_user_comments_with_bets as (
      select created_time, data->>'betId' as bet_id from contract_comments
      where contract_id = $1 and user_id = $2
      and created_time < millis_to_ts($3)
      and data ->> 'betId' is not null
      and created_time > millis_to_ts($3) - interval $5
      order by created_time desc
      limit 1
    ),
    cutoff_time as (
      select coalesce(
         (select created_time from prior_user_comments_with_bets),
         millis_to_ts($3) - interval $5)
      as cutoff
    )
    select data from contract_bets
      where contract_id = $1
      and user_id = $2
      and ($4 is null or answer_id = $4)
      and created_time < millis_to_ts($3)
      and created_time > (select cutoff from cutoff_time)
      and not is_ante
      and not is_redemption
      order by created_time desc
      limit 1
    `,
      [contractId, userId, commentCreatedTime, answerOutcome, maxAge],
      (r) => (r.data ? (r.data as Bet) : undefined)
    )
    .catch((e) => console.error('Failed to get bet: ' + e))
  return first(bet ?? [])
}

async function getLargestPosition(
  pg: SupabaseDirectClient,
  contractId: string,
  userId: string
) {
  // mqp: should probably use user_contract_metrics for this, i am just lazily porting
  return await pg
    .oneOrNone(
      `with user_positions as (
      select answer_id, outcome, sum(shares) as shares
      from contract_bets
      where contract_id = $1
      and user_id = $2
      group by answer_id, outcome
    )
    select * from user_positions order by shares desc limit 1`,
      [contractId, userId]
    )
    .catch((e) => console.error('Failed to get position: ' + e))
}
