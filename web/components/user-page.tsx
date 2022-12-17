import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { LinkIcon } from '@heroicons/react/solid'
import {
  FolderIcon,
  PencilIcon,
  ScaleIcon,
  DocumentIcon,
} from '@heroicons/react/outline'
import toast from 'react-hot-toast'
import { difference } from 'lodash'

import { User } from 'web/lib/firebase/users'
import { useUser, useUserById, usePrefetchUsers } from 'web/hooks/use-user'
import { useDiscoverUsers } from 'web/hooks/use-users'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { CreatorContractsList } from './contract/contracts-grid'
import { SEO } from './SEO'
import { Page } from './layout/page'
import { linkClass, SiteLink } from './widgets/site-link'
import { Avatar } from './widgets/avatar'
import { Col } from './layout/col'
import { Linkify } from './widgets/linkify'
import { Spacer } from './layout/spacer'
import { Row } from './layout/row'
import { Modal } from './layout/modal'
import { Tabs } from './layout/tabs'
import { QueryUncontrolledTabs } from './layout/tabs'
import { UserCommentsList } from './comments/comments-list'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { BetsList } from './bet/bets-list'
import { UserFollowButton } from './buttons/follow-button'
import { FollowList } from './follow-list'
import { GroupsButton } from 'web/components/groups/groups-button'
import { PortfolioValueSection } from './portfolio/portfolio-value-section'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { DOMAIN, ENV_CONFIG } from 'common/envs/constants'
import { PostCardList } from './posts/post-card'
import { usePostsByUser } from 'web/hooks/use-post'
import { LoadingIndicator } from './widgets/loading-indicator'
import { DailyStats } from 'web./groups/group-post-sectionats'
import { SectionHeader } from './groups/group-about'
import { buttonClass } from './buttons/button'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { PostBanBadge, UserBadge } from './widgets/user-link'
import Link from 'next/link'
import { UserLikedContractsButton } from 'web/components/profile/user-liked-contracts-button'
import ImageWithBlurredShadow from './widgets/image-with-blurred-shadow'
import { TextButton } from 'web/components/buttons/text-button'

export function UserPage(props: { user: User }) {
  const user = useUserById(props.user.id) ?? props.user

  const router = useRouter()
  const currentUser = useUser()
  const isCurrentUser = user.id === currentUser?.id
  const [showConfetti, setShowConfetti] = useState(false)
  const userPosts = usePostsByUser(user.id)

  useEffect(() => {
    const claimedMana = router.query['claimed-mana'] === 'yes'
    setShowConfetti(claimedMana)
    const query = { ...router.query }
    if (query.claimedMana || query.show) {
      const queriesToDelete = ['claimed-mana', 'show', 'badge']
      queriesToDelete.forEach((key) => delete query[key])
      router.replace(
        {
          pathname: router.pathname,
          query,
        },
        undefined,
        { shallow: true }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const referralUrl = `https://${DOMAIN}?referrer=${user?.username}`

  return (
    <Page key={user.id}>
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {showConfetti && (
        <FullscreenConfetti recycle={false} numberOfPieces={300} />
      )}

      <Col className="relative">
        <Row className="relative px-4 pt-4">
          <ImageWithBlurredShadow
            image={
              <Avatar
                username={user.username}
                avatarUrl={user.avatarUrl}
                size={24}
                className="bg-white"
              />
            }
          />
          {isCurrentUser && (
            <div className="absolute ml-16 mt-16 rounded-full bg-indigo-600 p-2 text-white shadow-sm shadow-indigo-300">
              <Link href="/profile">
                <PencilIcon className="h-5" />
              </Link>
            </div>
          )}

          <Col className="w-full gap-4 pl-5">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
              <Col>
                <div className="inline-flex flex-row items-center gap-1">
                  <span className="break-anywhere text-lg font-bold sm:text-2xl">
                    {user.name}
                  </span>
                  {<UserBadge username={user.username} />}
                  {user.isBannedFromPosting && <PostBanBadge />}
                </div>
                <Row className="sm:text-md items-center gap-x-3 text-sm ">
                  <span className={' text-gray-400'}>@{user.username}</span>
                </Row>
              </Col>
              <Row
                className={
                  'h-full w-full items-center justify-between sm:w-auto sm:justify-end sm:gap-4'
                }
              >
                {isCurrentUser && <DailyStats user={user} showLoans />}
                {!isCurrentUser && <UserFollowButton userId={user.id} />}
                {!isCurrentUser && <MoreOptionsUserButton user={user} />}
              </Row>
            </div>
            <ProfilePublicStats
              className="sm:text-md hidden text-sm text-gray-600 md:inline"
              user={user}
            />
          </Col>
        </Row>
        <Col className="mx-4 mt-2">
          <Spacer h={1} />
          <ProfilePublicStats
            className="text-sm text-gray-600 md:hidden"
            user={user}
          />
          <Spacer h={1} />
          {user.bio && (
            <>
              <div className="sm:text-md mt-2 text-sm sm:mt-0">
                <Linkify text={user.bio}></Linkify>
              </div>
              <Spacer h={2} />
            </>
          )}
          {(user.website || user.twitterHandle || user.discordHandle) && (
            <Row className="mb-2 flex-wrap items-center gap-2 sm:gap-4">
              {user.website && (
                <SiteLink
                  href={
                    'https://' +
                    user.website.replace('http://', '').replace('https://', '')
                  }
                >
                  <Row className="items-center gap-1">
                    <LinkIcon className="h-4 w-4" />
                    <span className="text-sm text-gray-400">
                      {user.website}
                    </span>
                  </Row>
                </SiteLink>
              )}

              {user.twitterHandle && (
                <SiteLink
                  href={`https://twitter.com/${user.twitterHandle
                    .replace('https://www.twitter.com/', '')
                    .replace('https://twitter.com/', '')
                    .replace('www.twitter.com/', '')
                    .replace('twitter.com/', '')}`}
                >
                  <Row className="items-center gap-1">
                    <img
                      src="/twitter-logo.svg"
                      className="h-4 w-4"
                      alt="Twitter"
                    />
                    <span className="text-sm text-gray-400">
                      {user.twitterHandle}
                    </span>
                  </Row>
                </SiteLink>
              )}

              {user.discordHandle && (
                <SiteLink href="https://discord.com/invite/eHQBNBqXuh">
                  <Row className="items-center gap-1">
                    <img
                      src="/discord-logo.svg"
                      className="h-4 w-4"
                      alt="Discord"
                    />
                    <span className="text-sm text-gray-400">
                      {user.discordHandle}
                    </span>
                  </Row>
                </SiteLink>
              )}

              {isCurrentUser && (
                <div
                  className={clsx(
                    linkClass,
                    'cursor-pointer text-sm text-gray-400'
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    copyToClipboard(referralUrl)
                    toast.success('Referral link copied!', {
                      icon: <LinkIcon className="h-6 w-6" aria-hidden="true" />,
                    })
                    track('copy referral link')
                  }}
                >
                  <Row className="items-center gap-1">
                    <LinkIcon className="h-4 w-4" />
                    Earn {ENV_CONFIG.moneyMoniker}250 per friend referred
                  </Row>
                </div>
              )}
            </Row>
          )}
          <QueryUncontrolledTabs
            currentPageForAnalytics={'profile'}
            labelClassName={'pb-2 pt-1 sm:pt-4 '}
            tabs={[
              {
                title: 'Markets',
                stackedTabIcon: <ScaleIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <CreatorContractsList creator={user} />
                  </>
                ),
              },
              {
                title: 'Portfolio',
                stackedTabIcon: <FolderIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <PortfolioValueSection userId={user.id} />
                    <Spacer h={4} />
                    <BetsList user={user} />
                  </>
                ),
              },
              {
                title: 'Posts',
                stackedTabIcon: <DocumentIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />

                    <Row className="flex items-center justify-between">
                      <SectionHeader label={'Posts'} href={''} />

                      {currentUser && (
                        <Link
                          className={clsx('mb-3', buttonClass('md', 'indigo'))}
                          href={'/create-post'}
                          onClick={() => track('profile click create post')}
                        >
                          Create Post
                        </Link>
                      )}
                    </Row>

                    <Col>
                      {userPosts ? (
                        userPosts.length > 0 ? (
                          <PostCardList posts={userPosts} limit={6} />
                        ) : (
                          <div className="text-center text-gray-400">
                            No posts yet
                          </div>
                        )
                      ) : (
                        <div className="text-center text-gray-400">
                          <LoadingIndicator />
                        </div>
                      )}
                    </Col>
                    <Spacer h={4} />
                    <SectionHeader label={'Comments'} href={''} />
                    <Col>
                      <UserCommentsList user={user} />
                    </Col>
                  </>
                ),
              },
            ]}
          />
        </Col>
      </Col>
    </Page>
  )
}

type FollowsDialogTab = 'following' | 'followers'

function ProfilePublicStats(props: { user: User; className?: string }) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)
  const [followsTab, setFollowsTab] = useState<FollowsDialogTab>('following')
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)

  const openDialog = (tabName: FollowsDialogTab) => {
    setIsOpen(true)
    setFollowsTab(tabName)
  }

  return (
    <Row className="flex-wrap items-center gap-3">
      <TextButton onClick={() => openDialog('following')} className={className}>
        <span className={clsx('font-semibold')}>
          {followingIds?.length ?? ''}
        </span>{' '}
        Following
      </TextButton>
      <TextButton onClick={() => openDialog('followers')} className={className}>
        <span className={clsx('font-semibold')}>
          {followerIds?.length ?? ''}
        </span>{' '}
        Followers
      </TextButton>

      <FollowsDialog
        user={user}
        defaultTab={followsTab}
        followingIds={followingIds}
        followerIds={followerIds}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
      {/* <ReferralsButton user={user} className={className} /> */}
      <GroupsButton user={user} className={className} />
      <UserLikedContractsButton user={user} className={className} />
    </Row>
  )
}

function FollowsDialog(props: {
  user: User
  followingIds: string[] | undefined
  followerIds: string[] | undefined
  defaultTab: FollowsDialogTab
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, followingIds, followerIds, defaultTab, isOpen, setIsOpen } =
    props

  const currentUser = useUser()
  const myFollowedIds = useFollows(currentUser?.id)

  // mqp: this is a ton of work, don't fetch it unless someone looks.
  // if you want it to be faster, then you gotta precompute stuff for it somewhere
  const discoverUserIds = useDiscoverUsers(isOpen ? user.id : undefined)
  const nonSuggestions = [
    user?.id ?? '',
    currentUser?.id ?? '',
    ...(myFollowedIds ?? []),
  ]
  const suggestedUserIds =
    discoverUserIds == null
      ? undefined
      : difference(discoverUserIds, nonSuggestions).slice(0, 50)

  usePrefetchUsers([
    ...(followerIds ?? []),
    ...(followingIds ?? []),
    ...(suggestedUserIds ?? []),
  ])

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="max-h-[90vh] rounded bg-white p-6 pb-2">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="p-2 pt-0 text-sm text-gray-500">@{user.username}</div>
        <Tabs
          tabs={[
            {
              title: 'Following',
              content: (
                <FollowList
                  userIds={followingIds}
                  myFollowedIds={myFollowedIds}
                />
              ),
            },
            {
              title: 'Followers',
              content: (
                <FollowList
                  userIds={followerIds}
                  myFollowedIds={myFollowedIds}
                />
              ),
            },
            {
              title: 'Similar',
              content: (
                <FollowList
                  userIds={suggestedUserIds}
                  myFollowedIds={myFollowedIds}
                />
              ),
            },
          ]}
          defaultIndex={defaultTab === 'following' ? 0 : 1}
        />
      </Col>
    </Modal>
  )
}
