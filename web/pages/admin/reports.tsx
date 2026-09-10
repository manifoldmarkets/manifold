import { JSONContent } from '@tiptap/core'
import { contractPath } from 'common/contract'
import { Row, millisToTs, run, tsToMillis } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { groupBy } from 'lodash'
import Link from 'next/link'
import { NoSEO } from 'web/components/NoSEO'
import { Page } from 'web/components/layout/page'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { Title } from 'web/components/widgets/title'
import { Tooltip } from 'web/components/widgets/tooltip'
import { BannedBadge, UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { usePagination } from 'web/hooks/use-pagination'
import { APIError, api } from 'web/lib/api/api'
import { convertContractComment } from 'common/supabase/comments'
import { db } from 'web/lib/supabase/db'
import { DisplayUser, getDisplayUsers } from 'web/lib/supabase/users'
import { convertPost } from 'common/top-level-post'

const PAGE_SIZE = 20

export async function getStaticProps() {
  try {
    const reports = await getReports({ limit: PAGE_SIZE })
    // Direct database lookups can leave nested undefined fields (e.g. optional
    // entitlement expiry/metadata), which Next.js rejects in static props.
    const serializedReports: LiteReport[] = JSON.parse(JSON.stringify(reports))
    return {
      props: { reports: serializedReports },
      revalidate: 60,
    }
  } catch (e) {
    console.error(e)
    return { props: { reports: [] }, revalidate: 60 }
  }
}

export default function Reports(props: { reports: LiteReport[] }) {
  const pagination = usePagination<LiteReport>({
    pageSize: PAGE_SIZE,
    q: getReports,
    prefix: props.reports,
  })

  const reportsByContent = Object.values(groupBy(pagination.items, 'contentId'))

  const isAdmin = useAdmin()
  if (!isAdmin) return <></>

  return (
    <Page trackPageView={false} className="px-2">
      <NoSEO />
      <Title>Reports</Title>
      <div className="flex w-full flex-col">
        <PaginationNextPrev {...pagination} />

        {!pagination.isLoading &&
          reportsByContent.map((reports) => {
            const { slug, text, owner, contentId, contentType, createdTime } =
              reports[0]

            return (
              <div key={contentId} className="my-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserHovercard userId={owner.id}>
                      <div className="flex items-center">
                        <Avatar
                          username={owner.username}
                          avatarUrl={owner.avatarUrl}
                          size="sm"
                        />
                        <UserLink user={owner} className="text-ink-800 ml-2" />
                        {owner.isBannedFromPosting && <BannedBadge />}
                      </div>
                    </UserHovercard>

                    <div>
                      {contentType === 'user' ? (
                        'was reported'
                      ) : (
                        <>
                          <Tooltip
                            text={reports.map(({ reporter }, i) => (
                              <div key={i} className="flex gap-1">
                                <Avatar
                                  username={reporter.username}
                                  avatarUrl={reporter.avatarUrl}
                                  size="xs"
                                />
                                <UserLink user={reporter} />
                              </div>
                            ))}
                          >
                            {/* TODO: show reporting users? */}
                            was reported
                            {reports.length > 1 && (
                              <> {reports.length} times</>
                            )}{' '}
                            for this{' '}
                          </Tooltip>
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
                    <Content size="md" content={text} />
                  </div>
                )}

                <div className="mt-2">
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
        {!pagination.isLoading && (
          <PaginationNextPrev {...pagination} className="mb-8" />
        )}
      </div>
    </Page>
  )
}

export type ReportCursor = {
  createdTime?: number
  createdTimeIso?: string
  id?: string
}

export const getReportBatch = async (p: {
  limit: number
  offset?: number
  after?: ReportCursor
  ascending?: boolean
}) => {
  const ascending = p.ascending ?? false
  const q = db
    .from('reports')
    .select()
    .is('dismissed_by_user_id', null)
    .order('created_time', { ascending })
    .order('id', { ascending })

  const cursorTime =
    p.after?.createdTimeIso ??
    (p.after?.createdTime != null ? millisToTs(p.after.createdTime) : undefined)
  if (cursorTime) {
    const op = ascending ? 'gt' : 'lt'
    if (p.after?.id) {
      q.or(
        `created_time.${op}.${cursorTime},and(created_time.eq.${cursorTime},id.${op}.${JSON.stringify(
          p.after.id
        )})`
      )
    } else if (ascending) q.gt('created_time', cursorTime)
    else q.lt('created_time', cursorTime)
    q.limit(p.limit)
  } else {
    const offset = p.offset ?? 0
    q.range(offset, offset + p.limit - 1)
  }

  const { data } = await run(q)
  const last = data.at(-1)
  return {
    reports: await convertReports(data),
    // Advance using raw rows, including reports whose content has been deleted.
    // Preserve timestamp precision and use the ID to break timestamp ties.
    nextCursor:
      data.length === p.limit && last?.created_time
        ? { createdTimeIso: last.created_time, id: last.id }
        : undefined,
  }
}

export const getReports = async (p: Parameters<typeof getReportBatch>[0]) =>
  (await getReportBatch(p)).reports

export type LiteReport = {
  slug: string
  id: string
  text: string | JSONContent
  owner: DisplayUser
  reporter: DisplayUser
  reasonsDescription: string | null
  contentId: string
  contentType: string
  createdTime?: number
  createdTimeIso?: string
}

const convertReports = async (
  rows: Row<'reports'>[]
): Promise<LiteReport[]> => {
  if (rows.length === 0) return []
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [
        r.content_owner_id,
        r.user_id,
        ...(r.content_type === 'user' ? [r.content_id] : []),
      ])
    ),
  ]
  const marketIds = [
    ...new Set(
      filterDefined(
        rows.map((r) =>
          r.content_type === 'contract'
            ? r.content_id
            : r.content_type === 'comment' && r.parent_type === 'contract'
            ? r.parent_id
            : null
        )
      )
    ),
  ]
  const commentIds = rows
    .filter((r) => r.content_type === 'comment' && r.parent_type === 'contract')
    .map((r) => r.content_id)
  const postIds = rows
    .filter((r) => r.content_type === 'post')
    .map((r) => r.content_id)

  // Fetch each entity once per batch, with independent lookups in parallel.
  const [users, marketEntries, comments, posts] = await Promise.all([
    getDisplayUsers(userIds),
    Promise.all(
      marketIds.map(async (id) => {
        try {
          return [id, await api('market/:id', { id, lite: true })] as const
        } catch (error) {
          if (error instanceof APIError && error.code === 404)
            return [id, null] as const
          throw error
        }
      })
    ),
    commentIds.length
      ? run(db.from('contract_comments').select().in('comment_id', commentIds))
      : Promise.resolve({ data: [] }),
    postIds.length
      ? run(db.from('old_posts').select().in('id', postIds))
      : Promise.resolve({ data: [] }),
  ])
  const usersById = new Map(users.map((user) => [user.id, user]))
  const marketsById = new Map(marketEntries)
  const commentsById = new Map(
    comments.data.map((r) => [r.comment_id, convertContractComment(r)])
  )
  const postsById = new Map(posts.data.map((r) => [r.id, convertPost(r)]))

  return filterDefined(
    rows.map((report) => {
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
      const owner = usersById.get(contentOwnerId)
      const reporter = usersById.get(userId)
      if (!owner || !reporter) return null

      let content: { slug: string; text: JSONContent | string } | undefined
      if (contentType === 'contract') {
        const contract = marketsById.get(contentId)
        if (contract)
          content = { slug: contractPath(contract), text: contract.question }
      } else if (
        contentType === 'comment' &&
        parentType === 'contract' &&
        parentId
      ) {
        const contract = marketsById.get(parentId)
        const comment = commentsById.get(contentId)
        if (contract && comment)
          content = {
            slug: contractPath(contract) + '#' + comment.id,
            text: comment.content,
          }
      } else if (contentType === 'user') {
        const user = usersById.get(contentId)
        if (user) content = { slug: `/${user.username}`, text: user.name }
      } else if (contentType === 'post') {
        const post = postsById.get(contentId)
        if (post) content = { slug: `/post/${post.slug}`, text: post.content }
      }
      return content
        ? {
            ...content,
            reasonsDescription: description,
            owner,
            reporter,
            contentType,
            contentId,
            id,
            createdTime: tsToMillis(createdTime),
            createdTimeIso: createdTime ?? undefined,
          }
        : null
    })
  )
}
