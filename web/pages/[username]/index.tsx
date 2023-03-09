import React from 'react'
import {
  ChatAlt2Icon,
  FolderIcon,
  PencilIcon,
  ScaleIcon,
} from '@heroicons/react/outline'
import { LinkIcon, PresentationChartBarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { difference } from 'lodash'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import { DOMAIN, ENV_CONFIG, PROJECT_ID } from 'common/envs/constants'
import { Post } from 'common/post'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import Custom404 from 'web/pages/404'
import { useTracking } from 'web/hooks/use-tracking'
import { BlockedUser } from 'web/components/profile/blocked-user'
import { usePrivateUser } from 'web/hooks/use-user'
import { Title } from 'web/components/widgets/title'
import { getPostsByUser } from 'web/lib/firebase/posts'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { DailyStats } from 'web/components/daily-stats'
import { UserContractsList } from 'web/components/profile/user-contracts-list'
import { UserLikedContractsButton } from 'web/components/profile/user-liked-contracts-button'
import { useAdmin } from 'web/hooks/use-admin'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { usePostsByUser } from 'web/hooks/use-post'
import { usePrefetchUsers, useUser, useUserById } from 'web/hooks/use-user'
import { useDiscoverUsers } from 'web/hooks/use-users'
import { track } from 'web/lib/service/analytics'
import { copyToClipboard } from 'web/lib/util/copy'
import { BetsList } from 'web/components/bet/bets-list'
import { buttonClass } from 'web/components/buttons/button'
import { TextButton } from 'web/components/buttons/text-button'
import { UserFollowButton } from 'web/components/buttons/follow-button'
import { ReferralsButton } from 'web/components/buttons/referrals-button'
import { UserCommentsList } from 'web/components/comments/comments-list'
import { FollowList } from 'web/components/follow-list'
import { GroupsButton } from 'web/components/groups/groups-button'
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
  const isAdmin = useAdmin()
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

      <Col>
        <Row className="px-4 pt-4">
          <div className="relative">
            <ImageWithBlurredShadow
              image={
                <Avatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size={24}
                  className="bg-ink-1000"
                  noLink
                />
              }
            />
            {isCurrentUser && (
              <Link
                className="bg-primary-600 shadow-primary-300 hover:bg-primary-700 text-ink-0 absolute right-0 bottom-0 rounded-full p-2 shadow-sm"
                href="/profile"
              >
                <PencilIcon className="text-ink-0 h-5 w-5" />
              </Link>
            )}
          </div>

          <Col className="w-full gap-4 pl-5">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
              <Col>
                <div className="inline-flex flex-row items-center gap-1">
                  <span className="break-anywhere text-lg font-bold sm:text-2xl">
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
                <Row className="sm:text-md items-center gap-4 text-sm ">
                  <span className={' text-ink-400'}>@{user.username}</span>
                  {isAdmin && (
                    <span>
                      <a
                        className="text-primary-400 mr-2 text-sm hover:underline"
                        href={firestoreUserConsolePath(user.id)}
                      >
                        firestore user
                      </a>
                      <a
                        className="text-primary-400 text-sm hover:underline"
                        href={firestorePrivateConsolePath(user.id)}
                      >
                        private user
                      </a>
                    </span>
                  )}
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
            <div className={'hidden md:block'}>
              <ProfilePublicStats user={user} isCurrentUser={isCurrentUser} />
            </div>
          </Col>
        </Row>
        <Col className="mx-4 mt-2">
          <Spacer h={1} />
          <ProfilePublicStats
            className="md:hidden"
            user={user}
            isCurrentUser={isCurrentUser}
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

            {isCurrentUser && (
              <div
                className={clsx(
                  linkClass,
                  'text-ink-400 cursor-pointer text-sm'
                )}
                onClick={(e) => {
                  e.preventDefault()
                  copyToClipboard(referralUrl)
                  toast.success('Copied your referral link!', {
                    icon: <LinkIcon className="h-6 w-6" aria-hidden="true" />,
                  })
                  track('copy referral link')
                }}
              >
                <Row className="items-center gap-1">
                  <LinkIcon className="h-4 w-4" />
                  Referrals (earn {ENV_CONFIG.moneyMoniker}250)
                </Row>
              </div>
            )}

            <SiteLink
              href={'/' + user.username + '/calibration'}
              className={clsx(linkClass, 'text-ink-400 cursor-pointer text-sm')}
            >
              <Row className="items-center gap-1">
                <PresentationChartBarIcon className="h-4 w-4" />
                Calibration
              </Row>
            </SiteLink>
          </Row>

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
                    <UserContractsList creator={user} />
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
                    <Spacer h={8} />
                    <BetsList user={user} />
                  </>
                ),
              },
              {
                title: 'Comments',
                stackedTabIcon: <ChatAlt2Icon className="h-5" />,
                content: (
                  <>
                    {userPosts.length > 0 && (
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
  const createdTime = new Date(user.createdTime).toLocaleDateString('en-us', {
    year: 'numeric',
    month: 'short',
  })

  const openDialog = (tabName: FollowsDialogTab) => {
    setIsOpen(true)
    setFollowsTab(tabName)
  }

  return (
    <Row
      className={clsx(
        'text-ink-600 flex-wrap items-center gap-3 text-sm',
        className
      )}
    >
      <span>{`Joined ${createdTime}`}</span>

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
      {isCurrentUser && <GroupsButton user={user} className={className} />}
      {isCurrentUser && <ReferralsButton user={user} className={className} />}
      {isCurrentUser && (
        <UserLikedContractsButton user={user} className={className} />
      )}
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

function firestoreUserConsolePath(userId: string) {
  return `https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fusers~2F${userId}`
}

function firestorePrivateConsolePath(userId: string) {
  return `https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fprivate-users~2F${userId}`
}
