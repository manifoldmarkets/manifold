import clsx from 'clsx'
import { ContractComment, PostComment } from 'common/comment'
import { User } from 'common/user'
import { groupConsecutive } from 'common/util/array'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { getCommentLink } from 'web/components/feed/copy-link-date-time'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { linkClass } from 'web/components/widgets/site-link'
import { UserLink } from 'web/components/widgets/user-link'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { usePagination } from 'web/hooks/use-pagination'
import { api } from 'web/lib/api/api'
import { Col } from '../layout/col'
import { RelativeTimestamp } from '../relative-timestamp'
import { UserHovercard } from '../user/user-hovercard'
import { Avatar } from '../widgets/avatar'
import { Content } from '../widgets/editor'
import { Input } from '../widgets/input'
import { PaginationNextPrev } from '../widgets/pagination'

type Key = {
  slug: string
  title: string
}

function contractPath(slug: string) {
  // by convention this includes the contract creator username, but we don't
  // have that handy, so we just put /market/
  return `/market/${slug}`
}

export function UserCommentsList(props: { user: User }) {
  const { user } = props
  const [inputTerm, setInputTerm] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useDebouncedEffect(
    () => {
      setSearchTerm(inputTerm)
    },
    300,
    [inputTerm]
  )

  return (
    <Col className="">
      <div className="p-2">
        <Input
          type="text"
          inputMode="search"
          value={inputTerm}
          onChange={(e) => setInputTerm(e.target.value)}
          placeholder={`Search comments`}
          className="w-full"
        />
      </div>
      <UserCommentsListContent
        key={searchTerm}
        user={user}
        searchTerm={searchTerm}
      />
    </Col>
  )
}

function UserCommentsListContent(props: { user: User; searchTerm: string }) {
  const { user, searchTerm } = props

  const q = useCallback(
    async (p: { limit: number; offset: number }) => {
      const page = p.offset / p.limit
      return (await api('user-comments', {
        userId: user.id,
        limit: p.limit,
        page,
        term: searchTerm || undefined,
      })) as (ContractComment | PostComment)[]
    },
    [user.id, searchTerm]
  )
  const pagination = usePagination({ pageSize: 50, q })

  const items = groupConsecutive(pagination.items, (c) => {
    if (c.commentType === 'contract') {
      return {
        slug: c.contractSlug,
        title: c.contractQuestion,
      }
    } else {
      return {
        slug: c.postSlug ?? '',
        title: c.postTitle ?? '',
      }
    }
  })
  if (items.length === 0) {
    if (pagination.isComplete) {
      return <p className="text-ink-500 mt-4">No comments yet</p>
    } else {
      return <LoadingIndicator className="mt-4" />
    }
  }

  return (
    <Col className={'bg-canvas-50'}>
      {items.map(({ key, items }, i) => {
        return <ProfileCommentGroup key={i} groupKey={key} items={items} />
      })}
      <PaginationNextPrev
        className="border-ink-200 border-t px-4 py-3 sm:px-6"
        {...pagination}
      />
    </Col>
  )
}

function ProfileCommentGroup(props: {
  groupKey: Key
  items: (ContractComment | PostComment)[]
}) {
  const { groupKey, items } = props
  const { slug, title } = groupKey
  const path =
    items[0].commentType === 'contract' ? contractPath(slug) : `/post/${slug}`
  return (
    <div className="bg-canvas-0 border-ink-300 border-b p-2">
      <Link
        className={clsx(
          'text-primary-700 mb-2 block py-1 pl-2 font-medium',
          linkClass
        )}
        href={path}
      >
        {title}
      </Link>
      <Col className="gap-6">
        {items.map((c) => (
          <ProfileComment key={c.id} comment={c} slug={slug} />
        ))}
      </Col>
    </div>
  )
}

function ProfileComment(props: {
  comment: ContractComment | PostComment
  slug: string
}) {
  const { comment, slug } = props
  const {
    text,
    content,
    userId,
    userUsername,
    userName,
    userAvatarUrl,
    createdTime,
    id,
  } = comment

  return (
    <Link
      href={
        comment.commentType === 'contract'
          ? getCommentLink('market', slug, id)
          : `/post/${slug}#${id}`
      }
      className={
        'hover:bg-canvas-100 relative flex flex-row items-start space-x-3 rounded-lg p-2'
      }
    >
      <UserHovercard userId={userId}>
        <Avatar
          noLink={true}
          username={userUsername}
          avatarUrl={userAvatarUrl}
        />
      </UserHovercard>
      <div className="min-w-0 flex-1">
        <div className="text-ink-500 mt-0.5 text-sm">
          <UserHovercard userId={userId}>
            <UserLink
              className="text-ink-500"
              user={{
                id: userId,
                name: userName,
                username: userUsername,
              }}
              noLink={true}
            />
          </UserHovercard>{' '}
          <RelativeTimestamp time={createdTime} />
        </div>
        <Content content={content || text} size="sm" />
      </div>
    </Link>
  )
}
