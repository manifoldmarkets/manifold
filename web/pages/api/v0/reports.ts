import { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, ValidationError } from 'web/pages/api/v0/_types'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { collection, getDocs, query } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { Report } from 'common/report'
import { contractUrl, getContractFromId } from 'web/lib/firebase/contracts'
import { filterDefined } from 'common/util/array'
import {
  listAllComments,
  listAllCommentsOnPost,
} from 'web/lib/firebase/comments'
import { ENV_CONFIG } from 'common/envs/constants'
import { getPost, postPath } from 'web/lib/firebase/posts'
import { richTextToString } from 'common/util/parse'
import { getUser } from 'web/lib/firebase/users'
type LiteReport = {
  reportedById: string
  slug: string
  id: string
  text: string
  contentOwnerId: string
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

  const slugsByUserId: LiteReport[] = filterDefined(
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
        } = report

        // Reported contract
        if (contentType === 'contract') {
          const contract = await getContractFromId(contentId)
          return contract
            ? {
                slug: contractUrl(contract),
                reportedById: userId,
                id,
                text: contract.question,
                contentOwnerId,
              }
            : null
          // Reported comment on a contract
        } else if (
          contentType === 'comment' &&
          parentType === 'contract' &&
          parentId
        ) {
          const contract = await getContractFromId(parentId)
          if (contract) {
            const comments = (await listAllComments(contract.id)).filter(
              (comment) => comment.id === contentId
            )
            const comment = comments[0]
            return comments.length > 0
              ? {
                  slug: contractUrl(contract) + '#' + comment.id,
                  reportedById: userId,
                  id,
                  text: comment.text
                    ? comment.text
                    : richTextToString(comment.content),
                  contentOwnerId,
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
            return comments.length > 0
              ? {
                  slug:
                    `https://${ENV_CONFIG.domain}${postPath(post.slug)}` +
                    '#' +
                    comments[0].id,
                  reportedById: userId,
                  id,
                  text: richTextToString(comments[0].content),
                  contentOwnerId,
                }
              : null
          }
          // Reported a user, probably should add a field as to why they were reported
        } else if (contentType === 'user') {
          const reportedUser = await getUser(contentId)
          return {
            slug: `https://${ENV_CONFIG.domain}/${reportedUser.username}`,
            reportedById: userId,
            id,
            text: reportedUser.name,
            contentOwnerId,
          }
        }
      })
    )
  )

  res.status(200).json(slugsByUserId)
}
