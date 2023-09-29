import { JSONContent } from '@tiptap/core'
import { contractPath } from 'common/contract'
import { Row, run, tsToMillis } from 'common/supabase/utils'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { groupBy } from 'lodash'
import Link from 'next/link'
import { NoSEO } from 'web/components/NoSEO'
import { Page } from 'web/components/layout/page'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'
import { Title } from 'web/components/widgets/title'
import { Tooltip } from 'web/components/widgets/tooltip'
import { PostBanBadge, UserLink } from 'web/components/widgets/user-link'
import { getComment, getCommentsOnPost } from 'web/lib/supabase/comments'
import { getContract } from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { getPost, postPath } from 'web/lib/supabase/post'
import { getUser } from 'web/lib/supabase/user'

export async function getStaticProps() {
  const { data } = await run(
    db
      .from('reports')
      .select()
      .order('created_time', { ascending: false })
      .limit(500)
  )

  const reports = await getReports(data)

  return { props: { reports } }
}

export default function Reports(props: { reports: LiteReport[] }) {
  const reportsByContent = Object.values(groupBy(props.reports, 'contentId'))

  return (
    <Page trackPageView={false} className="px-2">
      <NoSEO />
      <Title>Reports</Title>
      {reportsByContent.map((reports) => {
        const { slug, text, owner, contentId, contentType, createdTime } =
          reports[0]

        return (
          <div key={contentId} className="my-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  <Avatar
                    username={owner.username}
                    avatarUrl={owner.avatarUrl}
                    size="sm"
                  />
                  <UserLink
                    name={owner.name}
                    username={owner.username}
                    className="text-ink-800 ml-2"
                  />
                  {owner.isBannedFromPosting && <PostBanBadge />}
                </div>

                <div>
                  {contentType === 'user' ? (
                    'was reported'
                  ) : (
                    <>
                      was reported for this{' '}
                      <Link
                        href={slug}
                        className="text-primary-700 text-md my-1"
                      >
                        {contentType}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              {createdTime && <RelativeTimestamp time={createdTime} />}
            </div>

            {contentType !== 'user' && (
              <div className="bg-canvas-0 my-2 max-h-[300px] overflow-y-auto rounded-lg p-2">
                <Content content={text} />
              </div>
            )}

            <div className="mt-2">
              {reports.length > 1 && (
                <Tooltip
                  hasSafePolygon
                  text={
                    <div className="flex flex-col">
                      {reports.map((r) => (
                        <div key={r.id}>{r.reportedById}</div>
                      ))}
                    </div>
                  }
                >
                  by {reports.length} users
                </Tooltip>
              )}
              {/* TODO: show reporting users? */}
              {reports
                .filter((report) => report.reasonsDescription)
                .map((report) => (
                  <div key={report.id} className="text-ink-700">
                    {report.reasonsDescription}
                  </div>
                ))}
            </div>
          </div>
        )
      })}
    </Page>
  )
}

// adapted from api/v0/reports

type LiteReport = {
  reportedById: string
  slug: string
  id: string
  text: string | JSONContent
  owner: User
  reasonsDescription: string | null
  contentId: string
  contentType: string
  createdTime?: number
}

const getReports = async (
  mostRecentReports: Row<'reports'>[]
): Promise<LiteReport[]> => {
  return filterDefined(
    await Promise.all(
      mostRecentReports.map(async (report) => {
        const {
          content_id: contentId,
          content_type: contentType,
          content_owner_id: contentOwnerId,
          parent_type: parentType,
          parent_id: parentId,
          user_id: userId,
          created_time: createdTime,
          id,
          description,
        } = report

        let partialReport: { slug: string; text: JSONContent | string } | null =
          null
        // Reported contract
        if (contentType === 'contract') {
          const contract = await getContract(contentId)
          partialReport = contract
            ? {
                slug: contractPath(contract),
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
              slug: contractPath(contract) + '#' + comment.id,
              text: comment.content,
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
                    slug: `/${postPath(post.slug)}` + '#' + comments[0].id,
                    text: comments[0].content,
                  }
                : null
          }
          // Reported a user
        } else if (contentType === 'user') {
          const reportedUser = await getUser(contentId)
          partialReport = {
            slug: `/${reportedUser?.username}`,
            text: reportedUser?.name ?? '',
          }
        }

        const owner = await getUser(contentOwnerId)

        return partialReport && owner
          ? {
              ...partialReport,
              reasonsDescription: description,
              owner,
              reportedById: userId,
              contentType,
              contentId,
              id,
              createdTime: tsToMillis(createdTime as any),
            }
          : null
      })
    )
  )
}
