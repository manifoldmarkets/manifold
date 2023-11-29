import { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, ValidationError } from 'web/pages/api/v0/_types'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { contractUrl } from 'common/contract'
import { filterDefined } from 'common/util/array'
import { getComment, getCommentsOnPost } from 'web/lib/supabase/comments'
import { ENV_CONFIG } from 'common/envs/constants'
import { postPath } from 'web/lib/supabase/post'
import { getPost } from 'web/lib/supabase/post'
import { richTextToString } from 'common/util/parse'
import { getUser } from 'web/lib/firebase/users'
import { getContract } from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'

type LiteReport = {
  reportedById: string
  slug: string
  id: string
  text: string
  contentOwnerId: string
  reasonsDescription: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiteReport[] | ValidationError | ApiError>
) {
  await applyCorsHeaders(req, res)

  const { data: mostRecentReports } = await run(
    db
      .from('reports')
      .select()
      .order('created_time', { ascending: false })
      .limit(100)
  )

  const liteReports: LiteReport[] = filterDefined(
    await Promise.all(
      mostRecentReports.map(async (report) => {
        const {
          content_id: contentId,
          content_type: contentType,
          content_owner_id: contentOwnerId,
          parent_type: parentType,
          parent_id: parentId,
          user_id: userId,
          id,
          description,
        } = report

        let partialReport: { slug: string; text: string } | null = null
        // Reported contract
        if (contentType === 'contract') {
          const contract = await getContract(contentId)
          partialReport = contract
            ? {
                slug: contractUrl(contract),
                text: contract.question,
              }
            : null
          // Reported comment on a contract
        } else if (
          contentType === 'comment' &&
          parentType === 'contract' &&
          parentId
        ) {
          const contract = await getContract(parentId)
          if (contract) {
            const comment = await getComment(contentId)
            partialReport = comment && {
              slug: contractUrl(contract) + '#' + comment.id,
              text: comment.text
                ? comment.text
                : richTextToString(comment.content),
            }
          }
          // Reported comment on a post
        } else if (
          contentType === 'comment' &&
          parentType === 'post' &&
          parentId
        ) {
          const post = await getPost(parentId)
          if (post) {
            const comments = (await getCommentsOnPost(post.id)).filter(
              (comment) => comment.id === contentId
            )
            partialReport =
              comments.length > 0
                ? {
                    slug:
                      `https://${ENV_CONFIG.domain}${postPath(post.slug)}` +
                      '#' +
                      comments[0].id,
                    text: richTextToString(comments[0].content),
                  }
                : null
          }
          // Reported a user
        } else if (contentType === 'user') {
          const reportedUser = await getUser(contentId)
          partialReport = {
            slug: `https://${ENV_CONFIG.domain}/${reportedUser.username}`,
            text: reportedUser.name,
          }
        }
        return partialReport
          ? {
              ...partialReport,
              reasonsDescription: description ?? '',
              contentOwnerId,
              id,
              reportedById: userId,
            }
          : null
      })
    )
  )

  res.status(200).json(liteReports)
}
