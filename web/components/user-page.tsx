import clsx from 'clsx'
import { Dictionary, keyBy, uniq } from 'lodash'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { LinkIcon } from '@heroicons/react/solid'
import { PencilIcon } from '@heroicons/react/outline'
import Confetti from 'react-confetti'

import {
  follow,
  unfollow,
  User,
  getPortfolioHistory,
} from 'web/lib/firebase/users'
import { CreatorContractsList } from './contract/contracts-list'
import { SEO } from './SEO'
import { Page } from './page'
import { SiteLink } from './site-link'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { Linkify } from './linkify'
import { Spacer } from './layout/spacer'
import { Row } from './layout/row'
import { genHash } from 'common/util/random'
import { Tabs } from './layout/tabs'
import { UserCommentsList } from './comments-list'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Comment, getUsersComments } from 'web/lib/firebase/comments'
import { Contract } from 'common/contract'
import { getContractFromId, listContracts } from 'web/lib/firebase/contracts'
import { LoadingIndicator } from './loading-indicator'
import { BetsList } from './bets-list'
import { FollowersButton, FollowingButton } from './following-button'
import { useFollows } from 'web/hooks/use-follows'
import { FollowButton } from './follow-button'
import { PortfolioMetrics } from 'common/user'
import { GroupsButton } from 'web/components/groups/groups-button'
import { PortfolioValueSection } from './portfolio/portfolio-value-section'
import { filterDefined } from 'common/util/array'
import { useUserBets } from 'web/hooks/use-user-bets'
import { ReferralsButton } from 'web/components/referrals-button'
import { formatMoney } from 'common/util/format'

export function UserLink(props: {
  name: string
  username: string
  showUsername?: boolean
  className?: string
  justFirstName?: boolean
}) {
  const { name, username, showUsername, className, justFirstName } = props

  return (
    <SiteLink
      href={`/${username}`}
      className={clsx('z-10 truncate', className)}
    >
      {justFirstName ? name.split(' ')[0] : name}
      {showUsername && ` (@${username})`}
    </SiteLink>
  )
}

export const TAB_IDS = ['markets', 'comments', 'bets', 'groups']
const JUNE_1_2022 = new Date('2022-06-01T00:00:00.000Z').valueOf()

export function UserPage(props: {
  user: User
  currentUser?: User
  defaultTabTitle?: string | undefined
}) {
  const { user, currentUser, defaultTabTitle } = props
  const router = useRouter()
  const isCurrentUser = user.id === currentUser?.id
  const bannerUrl = user.bannerUrl ?? defaultBannerUrl(user.id)
  const [usersComments, setUsersComments] = useState<Comment[] | undefined>()
  const [usersContracts, setUsersContracts] = useState<Contract[] | 'loading'>(
    'loading'
  )
  const userBets = useUserBets(user.id, { includeRedemptions: true })
  const betCount =
    userBets === undefined
      ? 0
      : userBets.filter((bet) => !bet.isRedemption && bet.amount !== 0).length

  const [portfolioHistory, setUsersPortfolioHistory] = useState<
    PortfolioMetrics[]
  >([])
  const [contractsById, setContractsById] = useState<
    Dictionary<Contract> | undefined
  >()
  const [showConfetti, setShowConfetti] = useState(false)
  const { width, height } = useWindowSize()

  useEffect(() => {
    const claimedMana = router.query['claimed-mana'] === 'yes'
    setShowConfetti(claimedMana)
  }, [router])

  useEffect(() => {
    if (!user) return
    getUsersComments(user.id).then(setUsersComments)
    listContracts(user.id).then(setUsersContracts)
    getPortfolioHistory(user.id).then(setUsersPortfolioHistory)
  }, [user])

  // TODO: display comments on groups
  useEffect(() => {
    if (usersComments && userBets) {
      const uniqueContractIds = uniq([
        ...usersComments.map((comment) => comment.contractId),
        ...(userBets?.map((bet) => bet.contractId) ?? []),
      ])
      Promise.all(
        uniqueContractIds.map((contractId) =>
          contractId ? getContractFromId(contractId) : undefined
        )
      ).then((contracts) => {
        const contractsById = keyBy(filterDefined(contracts), 'id')
        setContractsById(contractsById)
      })
    }
  }, [userBets, usersComments])

  const yourFollows = useFollows(currentUser?.id)
  const isFollowing = yourFollows?.includes(user.id)
  const profit = user.profitCached.allTime

  const onFollow = () => {
    if (!currentUser) return
    follow(currentUser.id, user.id)
  }
  const onUnfollow = () => {
    if (!currentUser) return
    unfollow(currentUser.id, user.id)
  }

  return (
    <Page key={user.id}>
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {showConfetti && (
        <Confetti
          width={width ? width : 500}
          height={height ? height : 500}
          recycle={false}
          numberOfPieces={300}
        />
      )}
      {/* Banner image up top, with an circle avatar overlaid */}
      <div
        className="h-32 w-full bg-cover bg-center sm:h-40"
        style={{
          backgroundImage: `url(${bannerUrl})`,
        }}
      ></div>
      <div className="relative mb-20">
        <div className="absolute -top-10 left-4">
          <Avatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size={24}
            className="bg-white ring-4 ring-white"
          />
        </div>

        {/* Top right buttons (e.g. edit, follow) */}
        <div className="absolute right-0 top-0 mt-4 mr-4">
          {!isCurrentUser && (
            <FollowButton
              isFollowing={isFollowing}
              onFollow={onFollow}
              onUnfollow={onUnfollow}
            />
          )}
          {isCurrentUser && (
            <SiteLink className="btn" href="/profile">
              <PencilIcon className="h-5 w-5" />{' '}
              <div className="ml-2">Edit</div>
            </SiteLink>
          )}
        </div>
      </div>

      {/* Profile details: name, username, bio, and link to twitter/discord */}
      <Col className="mx-4 -mt-6">
        <span className="text-2xl font-bold">{user.name}</span>
        <span className="text-gray-500">@{user.username}</span>
        <span className="text-gray-500">
          <span
            className={clsx(
              'text-md',
              profit >= 0 ? 'text-green-600' : 'text-red-400'
            )}
          >
            {formatMoney(profit)}
          </span>{' '}
          profit
        </span>

        <Spacer h={4} />

        {user.bio && (
          <>
            <div>
              <Linkify text={user.bio}></Linkify>
            </div>
            <Spacer h={4} />
          </>
        )}

        <Col className="flex-wrap gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Row className="gap-4">
            <FollowingButton user={user} />
            <FollowersButton user={user} />
            {currentUser?.username === 'ian' && (
              <ReferralsButton user={user} currentUser={currentUser} />
            )}
            <GroupsButton user={user} />
          </Row>

          {user.website && (
            <SiteLink
              href={
                'https://' +
                user.website.replace('http://', '').replace('https://', '')
              }
            >
              <Row className="items-center gap-1">
                <LinkIcon className="h-4 w-4" />
                <span className="text-sm text-gray-500">{user.website}</span>
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
                <span className="text-sm text-gray-500">
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
                <span className="text-sm text-gray-500">
                  {user.discordHandle}
                </span>
              </Row>
            </SiteLink>
          )}
        </Col>

        <Spacer h={10} />

        {usersContracts !== 'loading' && contractsById && usersComments ? (
          <Tabs
            currentPageForAnalytics={'profile'}
            labelClassName={'pb-2 pt-1 '}
            defaultIndex={
              defaultTabTitle ? TAB_IDS.indexOf(defaultTabTitle) : 0
            }
            onClick={(tabName) => {
              const tabId = tabName.toLowerCase()
              const subpath = tabId === 'markets' ? '' : '?tab=' + tabId
              // BUG: if you start on `/Bob/bets`, then click on Markets, use-query-and-sort-params
              // rewrites the url incorrectly to `/Bob/bets` instead of `/Bob`
              router.push(`/${user.username}${subpath}`, undefined, {
                shallow: true,
              })
            }}
            tabs={[
              {
                title: 'Markets',
                content: <CreatorContractsList creator={user} />,
                tabIcon: (
                  <div className="px-0.5 font-bold">
                    {usersContracts.length}
                  </div>
                ),
              },
              {
                title: 'Comments',
                content: (
                  <UserCommentsList
                    user={user}
                    contractsById={contractsById}
                    comments={usersComments}
                  />
                ),
                tabIcon: (
                  <div className="px-0.5 font-bold">{usersComments.length}</div>
                ),
              },
              {
                title: 'Bets',
                content: (
                  <div>
                    <PortfolioValueSection
                      portfolioHistory={portfolioHistory}
                    />
                    <BetsList
                      user={user}
                      bets={userBets}
                      hideBetsBefore={isCurrentUser ? 0 : JUNE_1_2022}
                      contractsById={contractsById}
                    />
                  </div>
                ),
                tabIcon: <div className="px-0.5 font-bold">{betCount}</div>,
              },
            ]}
          />
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Page>
  )
}

// Assign each user to a random default banner based on the hash of userId
// TODO: Consider handling banner uploads using our own storage bucket, like user avatars.
export function defaultBannerUrl(userId: string) {
  const defaultBanner = [
    'https://images.unsplash.com/photo-1501523460185-2aa5d2a0f981?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2131&q=80',
    'https://images.unsplash.com/photo-1458682625221-3a45f8a844c7?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1974&q=80',
    'https://images.unsplash.com/photo-1558517259-165ae4b10f7f?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2080&q=80',
    'https://images.unsplash.com/photo-1563260797-cb5cd70254c8?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2069&q=80',
    'https://images.unsplash.com/photo-1603399587513-136aa9398f2d?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1467&q=80',
  ]
  return defaultBanner[genHash(userId)() % defaultBanner.length]
}
