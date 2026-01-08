import { JSONContent } from '@tiptap/core'
import { richTextToString } from 'common/util/parse'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { type APIHandler } from './helpers/endpoint'

// Manifold in the Wild user id to exclude
const MANIFOLD_IN_THE_WILD_ID = 'PNiqYrNgSfWKwO5Cyu76iO8tvnC2'

// Check if JSONContent contains any links
function hasLinks(content: JSONContent | null | undefined): boolean {
  if (!content) return false
  if (content.marks?.some((mark) => mark.type === 'link')) {
    return true
  }
  if (content.type === 'link') {
    return true
  }
  if (content.content) {
    return content.content.some((child) => hasLinks(child))
  }
  return false
}

async function checkIfSpam(
  commentText: string,
  marketTitle: string
): Promise<boolean> {
  const prompt = `You are a spam detector. Analyze the following comment that was posted on a prediction market.

Market title: "${marketTitle}"

Comment:
"""
${commentText}
"""

Is this comment spam? Spam comments typically:
- Contain promotional links to unrelated websites
- Mention products, services, or websites that have nothing to do with the market topic
- Include random irrelevant text alongside links
- Are SEO spam trying to promote unrelated content

Respond with ONLY "yes" if this is spam, or "no" if it's a legitimate comment.`

  try {
    const response = await promptAI(prompt, {
      model: aiModels.flash,
      thinkingLevel: 'minimal',
    })
    return response.toLowerCase().trim() === 'yes'
  } catch (e) {
    log.error('Error calling Gemini:', { error: e })
    return false
  }
}

export const getSuspectedSpamComments: APIHandler<
  'get-suspected-spam-comments'
> = async ({ limit, offset, ignoredIds }, auth) => {
  throwErrorIfNotMod(auth.uid)

  const pg = createSupabaseDirectClient()

  const ignoredIdsArray = ignoredIds ?? []
  const hasIgnoredIds = ignoredIdsArray.length > 0

  // Get total count (excluding ignored)
  const { count: total } = await pg.one<{ count: number }>(
    `select count(*)::int as count
     from contract_comments cc
     join contracts c on c.id = cc.contract_id
     join users u on u.id = cc.user_id
     where
       c.resolution_time is not null
       and coalesce((cc.data->>'deleted')::boolean, false) = false
       and coalesce((cc.data->>'hidden')::boolean, false) = false
       and (u.data->>'lastBetTime') is null
       and u.id != $1
       ${hasIgnoredIds ? 'and cc.comment_id != all($2)' : ''}`,
    hasIgnoredIds
      ? [MANIFOLD_IN_THE_WILD_ID, ignoredIdsArray]
      : [MANIFOLD_IN_THE_WILD_ID]
  )

  // Get comments (excluding ignored)
  const rawComments = await pg.manyOrNone<{
    commentId: string
    contractId: string
    content: JSONContent | null
    marketTitle: string
    marketSlug: string
    creatorUsername: string
    userId: string
    userName: string
    userUsername: string
    userAvatarUrl: string | null
    createdTime: number
  }>(
    `select
      cc.comment_id as "commentId",
      cc.contract_id as "contractId",
      cc.data->'content' as content,
      c.question as "marketTitle",
      c.slug as "marketSlug",
      c.data->>'creatorUsername' as "creatorUsername",
      cc.user_id as "userId",
      cc.data->>'userName' as "userName",
      cc.data->>'userUsername' as "userUsername",
      cc.data->>'userAvatarUrl' as "userAvatarUrl",
      extract(epoch from cc.created_time) * 1000 as "createdTime"
    from contract_comments cc
    join contracts c on c.id = cc.contract_id
    join users u on u.id = cc.user_id
    where
      c.resolution_time is not null
      and coalesce((cc.data->>'deleted')::boolean, false) = false
      and coalesce((cc.data->>'hidden')::boolean, false) = false
      and (u.data->>'lastBetTime') is null
      and u.id != $1
      ${hasIgnoredIds ? 'and cc.comment_id != all($4)' : ''}
    order by cc.created_time desc
    limit $2 offset $3`,
    hasIgnoredIds
      ? [MANIFOLD_IN_THE_WILD_ID, limit, offset, ignoredIdsArray]
      : [MANIFOLD_IN_THE_WILD_ID, limit, offset]
  )

  // Filter to only comments with links and check spam
  const commentsWithLinks = rawComments.filter((c) => hasLinks(c.content))

  const comments = await Promise.all(
    commentsWithLinks.map(async (comment) => {
      const commentText = richTextToString(comment.content ?? undefined)
      let isSpam: boolean | null = null

      if (commentText.trim()) {
        try {
          isSpam = await checkIfSpam(commentText, comment.marketTitle)
        } catch (e) {
          log.error('Error checking spam:', { error: e })
        }
      }

      return {
        ...comment,
        commentText,
        isSpam,
      }
    })
  )

  return { comments, total }
}
