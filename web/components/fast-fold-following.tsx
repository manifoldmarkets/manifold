import clsx from 'clsx'
import { useState } from 'react'
import { SearchIcon } from '@heroicons/react/outline'

import { User } from '../../common/user'
import { followFoldFromSlug, unfollowFoldFromSlug } from '../lib/firebase/folds'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'

function FollowFoldButton(props: {
  fold: { slug: string; name: string }
  user: User | null | undefined
  isFollowed?: boolean
}) {
  const { fold, user, isFollowed } = props
  const { slug, name } = fold

  const [followed, setFollowed] = useState(isFollowed)

  const onClick = async () => {
    if (followed) {
      if (user) await unfollowFoldFromSlug(slug, user.id)
      setFollowed(false)
    } else {
      if (user) await followFoldFromSlug(slug, user.id)
      setFollowed(true)
    }
  }

  return (
    <div
      className={clsx(
        'rounded-full border-2 px-4 py-1 shadow-md',
        'cursor-pointer',
        followed ? 'bg-gray-300 border-gray-300' : 'bg-white'
      )}
      onClick={onClick}
    >
      <span className="text-sm text-gray-500">{name}</span>
    </div>
  )
}

function FollowFolds(props: {
  folds: { slug: string; name: string }[]
  followedFoldSlugs: string[]
  noLabel?: boolean
  className?: string
  user: User | null | undefined
}) {
  const { folds, noLabel, className, user, followedFoldSlugs } = props

  return (
    <Row className={clsx('flex-wrap items-center gap-2', className)}>
      {folds.length > 0 && (
        <>
          {!noLabel && <div className="mr-1 text-gray-500">Communities</div>}
          {folds.map((fold) => (
            <FollowFoldButton
              key={fold.slug + followedFoldSlugs.length}
              user={user}
              fold={fold}
              isFollowed={followedFoldSlugs.includes(fold.slug)}
            />
          ))}
        </>
      )}
    </Row>
  )
}

export const FastFoldFollowing = (props: {
  followedFoldSlugs: string[]
  user: User | null | undefined
}) => {
  const { followedFoldSlugs, user } = props

  return (
    <>
      <Row className="mx-3 mb-3 items-center gap-2 text-sm text-gray-800">
        <SearchIcon className="inline h-5 w-5" aria-hidden="true" />
        Personalize your feed — click on a community to follow
      </Row>

      <FollowFolds
        className="mx-2"
        noLabel
        user={user}
        followedFoldSlugs={followedFoldSlugs}
        folds={[
          { name: 'Politics', slug: 'politics' },
          { name: 'Crypto', slug: 'crypto' },
          { name: 'Sports', slug: 'sports' },
          { name: 'Science', slug: 'science' },
          { name: 'Covid', slug: 'covid' },
          { name: 'AI', slug: 'ai' },
          {
            name: 'Manifold Markets',
            slug: 'manifold-markets',
          },
        ]}
      />

      <Spacer h={5} />
    </>
  )
}
