import React from 'react'
import {
  ChatAlt2Icon,
  CurrencyDollarIcon,
  PencilIcon,
  ScaleIcon,
} from '@heroicons/react/outline'
import { LinkIcon, PresentationChartBarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Post } from 'common/post'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import Custom404 from 'web/pages/404'
import { useTracking } from 'web/hooks/use-tracking'
import { BlockedUser } from 'web/components/profile/blocked-user'
import { usePrivateUser } from 'web/hooks/use-user'
import { Title } from 'web/components/widgets/title'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { UserContractsList } from 'web/components/profile/user-contracts-list'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { usePostsByUser } from 'web/hooks/use-post'
import { usePrefetchUsers, useUser, useUserById } from 'web/hooks/use-user'
import { useDiscoverUsers } from 'web/hooks/use-users'
import { track } from 'web/lib/service/analytics'
import { BetsList } from 'web/components/bet/bets-list'
import { buttonClass } from 'web/components/buttons/button'
import { TextButton } from 'web/components/buttons/text-button'
import { UserFollowButton } from 'web/components/buttons/follow-button'
import { UserCommentsList } from 'web/components/comments/comments-list'
import { FollowList } from 'web/components/follow-list'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { QueryUncontrolledTabs, Tabs } from 'web/components/layout/tabs'
import { PortfolioValueSection } from 'web/components/portfolio/portfolio-value-section'
import { PostCardList } from 'web/components/posts/post-card'
import { SEO } from 'web/components/SEO'
import { Avatar } from 'web/components/widgets/avatar'
import ImageWithBlurredShadow from 'web/components/widgets/image-with-blurred-shadow'
import { Linkify } from 'web/components/widgets/linkify'
import { linkClass, SiteLink } from 'web/components/widgets/site-link'
import {
  isFresh,
  PostBanBadge,
  UserBadge,
} from 'web/components/widgets/user-link'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { Subtitle } from 'web/components/widgets/subtitle'
import { DailyStats } from 'web/components/daily-stats'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { UserLikedContractsButton } from 'web/components/profile/user-liked-contracts-button'
import { getPostsByUser } from 'web/lib/supabase/post'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { DIVISION_NAMES, getLeaguePath } from 'common/leagues'
import TrophyIcon from 'web/lib/icons/trophy-icon'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  const posts = user ? await getPostsByUser(user?.id) : []

  return {
    props: {
      user,
      username,
      posts,
    },
    revalidate: 60, // Regenerate after 60 second
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPage(props: {
  user: User | null
  username: string
  posts: Post[]
}) {
  const { user, username, posts } = props
  const privateUser = usePrivateUser()
  const blockedByCurrentUser =
    privateUser?.blockedUserIds.includes(user?.id ?? '_') ?? false

  useTracking('view user profile', { username })
  useSaveReferral()

  if (!user) return <Custom404 />
  else if (user.userDeleted) return <DeletedUser />

  return privateUser && blockedByCurrentUser ? (
    <BlockedUser user={user} privateUser={privateUser} />
  ) : (
    <UserProfile user={user} posts={posts} />
  )
}

const DeletedUser = () => {
  return (
    <Page>
      <div className="flex h-full flex-col items-center justify-center">
        <Title children="Deleted account page" />
        <p>This user has been deleted.</p>
        <p>If you didn't expect this, let us know on Discord!</p>
        <br />
        <iframe
          src="https://discord.com/widget?id=915138780216823849&theme=dark"
          width="350"
          height="500"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        ></iframe>
      </div>
    </Page>
  )
}

export function UserProfile(props: { user: User; posts: Post[] }) {
  const user = useUserById(props.user.id) ?? props.user

  const router = useRouter()
  const currentUser = useUser()
  const isCurrentUser = user.id === currentUser?.id
  const [showConfetti, setShowConfetti] = useState(false)
  const userPosts = usePostsByUser(user.id) ?? props.posts

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
  }, [])

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

      <Col className="mx-4 mt-1">
        <Row className="flex-wrap justify-between gap-2 p-1">
          <Row className={clsx('gap-2')}>
            <Col className={'relative max-h-14'}>
              <ImageWithBlurredShadow
                image={
                  <Avatar
                    username={user.username}
                    avatarUrl={user.avatarUrl}
                    size={'lg'}
                    className="bg-ink-1000"
                    noLink
                  />
                }
              />
              {isCurrentUser && (
                <Link
                  className=" bg-primary-600 shadow-primary-300 hover:bg-primary-700 text-ink-0 absolute right-0 bottom-0 h-6 w-6 rounded-full p-1.5 shadow-sm"
                  href="/profile"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PencilIcon className="text-ink-0 h-3.5 w-3.5 " />
                </Link>
              )}
            </Col>
            <Col>
              <div className={'inline-flex flex-row items-center gap-1 pt-1'}>
                <span className="break-anywhere font-bold sm:text-xl">
                  {user.name}
                </span>
                {
                  <UserBadge
                    username={user.username}
                    fresh={isFresh(user.createdTime)}
                  />
                }
                {user.isBannedFromPosting && <PostBanBadge />}
              </div>
              <span className={'text-ink-400 text-sm sm:text-lg'}>
                @{user.username}
              </span>
            </Col>
          </Row>

          {isCurrentUser ? (
            <DailyStats user={user} />
          ) : (
            <Row className="items-center gap-2">
              <MoreOptionsUserButton user={user} />
              <UserFollowButton userId={user.id} />
            </Row>
          )}
        </Row>

        <Col className={'px-1'}>
          <ProfilePublicStats
            className=""
            user={user}
            isCurrentUser={isCurrentUser}
          />
          {user.bio && (
            <div className="sm:text-md mt-2 text-sm">
              <Linkify text={user.bio}></Linkify>
            </div>
          )}
          <Row className="mt-2 flex-wrap items-center gap-2 sm:gap-4">
            {user.website && (
              <SiteLink
                href={
                  'https://' +
                  user.website.replace('http://', '').replace('https://', '')
                }
              >
                <Row className="items-center gap-1">
                  <LinkIcon className="h-4 w-4" />
                  <span className="text-ink-400 text-sm">{user.website}</span>
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
                  <span className="text-ink-400 text-sm">
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
                  <span className="text-ink-400 text-sm">
                    {user.discordHandle}
                  </span>
                </Row>
              </SiteLink>
            )}
          </Row>
        </Col>

        <Col className="mt-2">
          <QueryUncontrolledTabs
            currentPageForAnalytics={'profile'}
            labelClassName={'pb-2 pt-1 sm:pt-4 '}
            tabs={[
              {
                title: 'Portfolio',
                stackedTabIcon: <CurrencyDollarIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <PortfolioValueSection userId={user.id} />
                    <Spacer h={8} />
                    <BetsList user={user} />
                  </>
                ),
              },
              {
                title: 'Markets',
                stackedTabIcon: <ScaleIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <UserContractsList creator={user} />
                  </>
                ),
              },
              {
                title: 'Comments',
                stackedTabIcon: <ChatAlt2Icon className="h-5" />,
                content: (
                  <>
                    {userPosts && userPosts.length > 0 && (
                      <>
                        <Spacer h={4} />
                        <Row className="mb-3 flex items-center justify-between">
                          <Subtitle className="!my-0">Posts</Subtitle>
                          {isCurrentUser && (
                            <Link
                              className={clsx(buttonClass('md', 'indigo'))}
                              href={'/create-post'}
                              onClick={() => track('profile click create post')}
                            >
                              Create Post
                            </Link>
                          )}
                        </Row>

                        <PostCardList posts={userPosts} limit={6} />
                        <Subtitle>Comments</Subtitle>
                      </>
                    )}
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

function ProfilePublicStats(props: {
  user: User
  isCurrentUser: boolean
  className?: string
}) {
  const { user, className, isCurrentUser } = props
  const [isOpen, setIsOpen] = useState(false)
  const [followsTab, setFollowsTab] = useState<FollowsDialogTab>('following')
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)
  const openDialog = (tabName: FollowsDialogTab) => {
    setIsOpen(true)
    setFollowsTab(tabName)
  }

  const leagueInfo = useLeagueInfo(user.id)

  return (
    <Row
      className={clsx(
        'text-ink-600 flex-wrap items-center gap-3 text-sm',
        className
      )}
    >
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

      {isCurrentUser && (
        <UserLikedContractsButton user={user} className={className} />
      )}
      <SiteLink
        href={'/' + user.username + '/calibration'}
        className={clsx(linkClass, 'cursor-pointer items-center text-sm')}
      >
        <Row className="items-center gap-1">
          <PresentationChartBarIcon className="h-4 w-4" />
          Calibration
        </Row>
      </SiteLink>

      {!isCurrentUser && leagueInfo && (
        <Link
          className={clsx(linkClass, className)}
          href={getLeaguePath(
            leagueInfo.season,
            leagueInfo.division,
            leagueInfo.cohort,
            user.id
          )}
        >
          <TrophyIcon className="mr-1 inline h-4 w-4" />
          <span className={clsx('font-semibold')}>
            {DIVISION_NAMES[leagueInfo.division ?? '']}
          </span>{' '}
          Rank {leagueInfo.rank}
        </Link>
      )}

      <FollowsDialog
        user={user}
        defaultTab={followsTab}
        followingIds={followingIds}
        followerIds={followerIds}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
      {/* {isCurrentUser && <GroupsButton user={user} className={className} />}
      {isCurrentUser && <ReferralsButton user={user} className={className} />}
      {isCurrentUser && (
        <UserLikedContractsButton user={user} className={className} />
      )} */}
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
  const suggestedUserIds = useDiscoverUsers(
    isOpen ? user.id : undefined, // don't bother fetching this unless someone looks
    myFollowedIds ?? [],
    50
  )

  usePrefetchUsers([
    ...(followerIds ?? []),
    ...(followingIds ?? []),
    ...(suggestedUserIds ?? []),
  ])

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="bg-canvas-0 max-h-[90vh] rounded p-6 pb-2">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="text-ink-500 p-2 pt-0 text-sm">@{user.username}</div>
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
