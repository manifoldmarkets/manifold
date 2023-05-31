import { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, ValidationError } from 'web/pages/api/v0/_types'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { collection, getDocs, query } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { Report } from 'common/report'
import { contractUrl } from 'common/contract'
import { filterDefined } from 'common/util/array'
import {
  listAllComments,
  listAllCommentsOnPost,
} from 'web/lib/firebase/comments'
import { ENV_CONFIG } from 'common/envs/constants'
import { postPath } from 'web/lib/supabase/post'
import { getPost } from 'web/lib/supabase/post'
import { richTextToString } from 'common/util/parse'
import { getUser } from 'web/lib/firebase/users'
import { getContract } from 'web/lib/supabase/contracts'
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
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const reportsQuery = await getDocs(query(collection(db, 'reports')))
  const mostRecentReports = reportsQuery.docs
    .map((doc) => doc.data() as Report)
    .sort((a, b) => b.createdTime - a.createdTime)
    .slice(0, 100)

  const liteReports: LiteReport[] = filterDefined(
    await Promise.all(
      mostRecentReports.map(async (report) => {
        const {
          contentId,
          contentType,
          contentOwnerId,
          parentType,
          parentId,
          userId,
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
            const comments = (await listAllComments(contract.id)).filter(
              (comment) => comment.id === contentId
            )
            const comment = comments[0]
            partialReport =
              comments.length > 0
                ? {
                    slug: contractUrl(contract) + '#' + comment.id,
                    text: comment.text
                      ? comment.text
                      : richTextToString(comment.content),
                  }
                : null
          }
          // Reported comment on a post
        } else if (
          contentType === 'comment' &&
          parentType === 'post' &&
          parentId
        ) {
          const post = await getPost(parentId)
          if (post) {
            const comments = (await listAllCommentsOnPost(post.id)).filter(
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
          // Reported a user, probably should add a field as to why they were reported
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
