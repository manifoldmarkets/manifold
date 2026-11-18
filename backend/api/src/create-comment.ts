import { JSONContent } from '@tiptap/core'
import { Bet } from 'common/bet'
import { ContractComment, MAX_COMMENT_JSON_LENGTH } from 'common/comment'
import { type Contract } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import { FLAT_COMMENT_FEE } from 'common/fees'
import { convertBet } from 'common/supabase/bets'
import { millisToTs } from 'common/supabase/utils'
import {
  newAccountGateMessage,
  passesNewAccountGate,
} from 'shared/new-account-gate'
import { buildArray } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import { first } from 'lodash'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { anythingToRichText } from 'shared/tiptap'
import { sanitizeJsonContent } from 'shared/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getContract, getUser, log } from 'shared/utils'
import { broadcastNewComment } from 'shared/websockets/helpers'
import { APIError, type APIHandler, AuthedUser } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'
import { onCreateCommentOnContract } from './on-create-comment-on-contract'
import { commentToYapContent } from 'shared/social-discussion'
import { socialPostDraftSchema } from 'common/social-post'
import { getComment } from 'shared/supabase/contract-comments'

// TODO: generate ids in supabase instead
export const newCommentId = () => Math.random().toString(36).substring(2, 15)

// Creates a new comment on a contract.
// Posts and chats are not supported yet.
export const createComment: APIHandler<'comment'> =
  onlyUsersWhoCanPerformAction('comment', async (props, auth, req) => {
    const {
      contractId,
      content,
      html,
      markdown,
      replyToCommentId,
      replyToAnswerId,
      replyToBetId,
      isModComment,
    } = props
    if (isModComment && !isModId(auth.uid) && !isAdminId(auth.uid)) {
      throw new APIError(403, 'Only moderators can post mod comments')
    }
    if (!isModComment && (replyToCommentId || !replyToAnswerId)) {
      const pg = createSupabaseDirectClient()
      const parent = replyToCommentId
        ? await pg.oneOrNone<{ id: string }>(
            `select s.id from social_posts s join contract_comments cc on cc.comment_id=s.market_comment_id
         where cc.comment_id=$1 and cc.contract_id=$2`,
            [replyToCommentId, contractId]
          )
        : await pg.oneOrNone<{ id: string }>(
            'select id from social_posts where canonical_key=$1',
            [replyToBetId ? `bet:${replyToBetId}` : `market:${contractId}`]
          )
      if (parent) {
        if (isModComment)
          throw new APIError(
            400,
            'Mod comments cannot also be posted to Yap. Post a separate mod comment on the market.'
          )
        const { contentJson } = await validateComment(
          contractId,
          auth.uid,
          content,
          html,
          markdown
        )
        const draft = socialPostDraftSchema.safeParse(
          commentToYapContent(contentJson)
        )
        if (!draft.success)
          throw new APIError(
            400,
            'This shared reply must fit Yap’s text and image limits.'
          )
        const { createSocialPost } = await import('./social-posts')
        const response = await createSocialPost(
          { parentId: parent.id, content: draft.data },
          auth,
          req
        )
        const post = 'result' in response ? response.result : response
        if (!post.marketCommentId)
          throw new APIError(500, 'Shared reply was not linked to its market')
        return {
          result: await getComment(pg, post.marketCommentId),
          continue: async () => {
            if ('continue' in response) await response.continue?.()
          },
        }
      }
    }
    return createCommentOnContractInternal(contractId, auth, {
      content,
      html,
      markdown,
      replyToCommentId,
      replyToAnswerId,
      replyToBetId,
      isModComment,
    })
  })

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
    isModComment?: boolean
    socialPostId?: string
    // Callers that must link the comment before it exists can assign its id
    id?: string
  },
  // Reads and writes through the caller's transaction, without taking another
  // connection. The caller announces the comment once it has committed.
  tx?: SupabaseTransaction
) => {
  const {
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
    isRepost,
    socialPostId,
    id,
    isModComment,
  } = options

  const pg = createSupabaseDirectClient()
  const db = tx ?? pg
  const {
    you: creator,
    contract,
    contentJson,
  } = await validateComment(contractId, auth.uid, content, html, markdown, db)

  const now = Date.now()

  if (replyToCommentId) {
    const repliedComment = await db.oneOrNone<{
      comment_id: string
      reply_to_comment_id: string | null
    }>(
      `select comment_id, data->>'replyToCommentId' as reply_to_comment_id
       from contract_comments
       where comment_id = $1 and contract_id = $2`,
      [replyToCommentId, contractId]
    )
    if (!repliedComment) {
      throw new APIError(404, 'Comment to reply to not found')
    }
    if (repliedComment.reply_to_comment_id) {
      throw new APIError(400, 'Can only reply to top-level comments')
    }
  }

  const bet = replyToBetId
    ? await db
        .one(`select * from contract_bets where bet_id = $1`, [replyToBetId])
        .then(convertBet)
    : undefined

  const isApi = auth.creds.kind === 'key'

  const comment = removeUndefinedProps({
    id: id ?? newCommentId(),
    content: contentJson,
    createdTime: now,

    userId: creator.id,
    userName: creator.name,
    userUsername: creator.username,
    userAvatarUrl: creator.avatarUrl,

    commentType: 'contract',
    contractId: contractId,
    contractSlug: contract.slug,
    contractQuestion: contract.question,
    replyToCommentId: replyToCommentId,
    answerOutcome: replyToAnswerId,
    visibility: contract.visibility,

    ...denormalizeBet(bet, contract),

    isApi,
    isRepost,
    socialPostId,
    isModComment: isModComment || undefined,
  } as ContractComment)
  await db
    .none(
      `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
              values ($1, $2, $3, $4, $5)`,
      [contractId, comment.id, creator.id, millisToTs(now), comment]
    )
    .catch((e) => {
      log.error(e)
      throw new APIError(500, 'Failed to create comment')
    })
  let announced = false
  const announce = () => {
    if (announced) return
    announced = true
    broadcastNewComment(contractId, contract.visibility, creator, comment)
  }
  if (!tx) announce()

  return {
    result: comment,
    // In a caller's transaction, call this as soon as it commits, as an
    // ordinary comment is announced right after its insert. The continuation
    // announces it otherwise.
    announce,
    continue: async () => {
      announce()
      if (isApi) {
        await pg.tx((tx) =>
          runTxnInBetQueue(tx, {
            category: 'BOT_COMMENT_FEE',
            token: 'M$',
            fromId: creator.id,
            fromType: 'USER',
            toId: 'BANK',
            toType: 'BANK',
            amount: FLAT_COMMENT_FEE,
          })
        )
      }
      let updatedComment = comment
      if (!replyToBetId) {
        log('finding most recent bet')
        const bet = await getMostRecentCommentableBet(
          pg,
          buildArray([contract.id, contract.siblingContractId]),
          creator.id,
          now,
          replyToAnswerId
        )

        const position = await getLargestPosition(pg, contract.id, creator.id)

        const denormalized = removeUndefinedProps({
          commentorPositionShares: position?.shares,
          commentorPositionOutcome: position?.outcome,
          commentorPositionAnswerId: position?.answer_id,
          commentorPositionProb:
            position && contract.mechanism === 'cpmm-1'
              ? contract.prob
              : undefined,
          ...denormalizeBet(bet, contract),
        })
        updatedComment = { ...comment, ...denormalized }
        // Merge these fields only: an edit or moderation since the insert stands.
        await updateData(pg, 'contract_comments', 'comment_id', {
          comment_id: comment.id,
          ...denormalized,
        })
      }

      await onCreateCommentOnContract({
        contract,
        comment: updatedComment,
        creator,
        bet,
      })
    },
  }
}
const denormalizeBet = (
  bet: Bet | undefined,
  contract: Contract | undefined
) => {
  return {
    betAmount: bet?.amount,
    betOutcome: bet?.outcome,
    betAnswerId: bet?.answerId,
    bettorId: bet?.userId,
    betOrderAmount: bet?.orderAmount,
    betLimitProb: bet?.limitProb,
    betId: bet?.id,

    betToken:
      !bet || !contract
        ? undefined
        : bet.contractId === contract.id
        ? contract.token
        : bet.contractId === contract.siblingContractId
        ? contract.token === 'MANA'
          ? 'CASH'
          : 'MANA'
        : undefined,
  }
}

export const validateComment = async (
  contractId: string,
  userId: string,
  content: JSONContent | undefined,
  html: string | undefined,
  markdown: string | undefined,
  // A caller's transaction reads through its own connection.
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  const you = await getUser(userId, pg)
  const contract = await getContract(pg, contractId)

  if (!you) throw new APIError(401, 'Your account was not found')
  if (you.userDeleted) throw new APIError(403, 'Your account is deleted')

  if (!contract) throw new APIError(404, 'Contract not found')

  // Market creators can always comment on their own markets. Everyone else
  // must pass the new-account gate, which unlocks after
  // NEW_USER_COMMENT_GATE_MS, KYC verification, any mana purchase, or any
  // active subscription.
  if (contract.creatorId !== you.id && !(await passesNewAccountGate(pg, you))) {
    throw new APIError(
      403,
      newAccountGateMessage("Commenting on other users' markets")
    )
  }
  if (contract.token !== 'MANA') {
    throw new APIError(
      400,
      `Can't comment on cash contract. Please do comment on the sibling mana contract ${contract.siblingContractId}`
    )
  }

  const contentJson =
    (content ? sanitizeJsonContent(content) : null) ||
    anythingToRichText({ html, markdown })

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
  contractIds: string[],
  userId: string,
  commentCreatedTime: number,
  answerOutcome?: string
) {
  const maxAge = '5 minutes'
  const bet = await pg
    .map(
      `with prior_user_comments_with_bets as (
      select created_time, data->>'betId' as bet_id from contract_comments
      where contract_id in ($1:list) and user_id = $2
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
    select * from contract_bets
      where contract_id in ($1:list)
      and user_id = $2
      and ($4 is null or answer_id = $4)
      and created_time < millis_to_ts($3)
      and created_time > (select cutoff from cutoff_time)
      and not is_redemption
      order by created_time desc
      limit 1
    `,
      [contractIds, userId, commentCreatedTime, answerOutcome, maxAge],
      convertBet
    )
    .catch((e) => log.error('Failed to get bet: ' + e))
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
    .catch((e) => log.error('Failed to get position: ' + e))
}
