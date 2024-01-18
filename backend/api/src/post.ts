import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { getContractSupabase, getUser } from 'shared/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getComment } from 'shared/supabase/contract_comments'
import { createCommentOnContractInternal } from 'api/create-comment'
import { repostContractToFeed } from 'shared/create-feed'
import { ContractComment } from 'common/comment'
import { removeUndefinedProps } from 'common/util/object'

export const post: APIHandler<'post'> = async (props, auth, { log }) => {
  const { contractId, content, betId: passedBetId, commentId } = props

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(404, 'Your account was not found')

  let comment: ContractComment
  let betId = passedBetId
  if (!content && !commentId && !betId) {
    throw new APIError(400, 'Must specify content, commentId, or betId')
  } else if (content && commentId) {
    throw new APIError(400, 'Cannot specify both content and commentId')
  } else if (content) {
    comment = await createCommentOnContractInternal(
      contractId,
      auth,
      removeUndefinedProps({
        content,
        isRepost: true,
        replyToBetId: passedBetId,
      })
    )
  } else {
    // TODO: should we mark the comment as `isRepost`?
    if (!commentId) throw new APIError(400, 'Must specify at least a commentId')
    const otherComment = await getComment(createSupabaseClient(), commentId)
    if (!otherComment) throw new APIError(404, `Comment ${commentId} not found`)
    comment = otherComment
  }
  if (comment.betId) betId = comment.betId

  log('Received post', {
    contractId,
    commentId,
    betId,
    content,
  })

  const pg = createSupabaseDirectClient()

  const res = await pg.one(
    `
    insert into posts
        (contract_id, contract_comment_id, bet_id, user_id, user_name, user_username, user_avatar_url)
        values ($1, $2, $3, $4, $5, $6, $7)
    returning id
        `,
    [
      contractId,
      commentId,
      betId,
      creator.id,
      creator.name,
      creator.username,
      creator.avatarUrl,
    ]
  )
  await repostContractToFeed(contract, comment, res.id, [auth.uid], betId)

  return comment
}
