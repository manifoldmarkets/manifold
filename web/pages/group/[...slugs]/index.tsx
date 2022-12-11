import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Router from 'next/router'

import { toast } from 'react-hot-toast'

import { Group, groupPath } from 'common/group'
import { Contract, listContractsByGroupSlug } from 'web/lib/firebase/contracts'
import {
  addContractToGroup,
  getGroupBySlug,
  joinGroup,
  listMemberIds,
} from 'web/lib/firebase/groups'
import { Row } from 'web/components/layout/row'
import {
  firebaseLogin,
  getUser,
  getUsersBlockFacetFilters,
  User,
} from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import {
  useGroup,
  useGroupContractIds,
  useMemberGroupsSubscription,
} from 'web/hooks/use-group'
import { Leaderboard } from 'web/components/leaderboard'
import { formatMoney } from 'common/util/format'
import Custom404 from '../../404'
import { SEO } from 'web/components/SEO'
import { fromPropz, usePropz } from 'web/hooks/use-propz'

import { ContractSearch } from 'web/components/contract-search'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Button } from 'web/components/buttons/button'
import { listAllCommentsOnGroup } from 'web/lib/firebase/comments'
import { GroupComment } from 'common/comment'
import { getPost, listPosts } from 'web/lib/firebase/posts'
import { Post } from 'common/post'
import { usePost, usePosts } from 'web/hooks/use-post'
import { useAdmin } from 'web/hooks/use-admin'
import { track } from 'web/lib/service/analytics'
import { ArrowLeftIcon, DotsVerticalIcon } from '@heroicons/react/solid'
import { SelectMarketsModal } from 'web/components/contract-select-modal'
import { BETTORS, PrivateUser } from 'common/user'
import { Page } from 'web/components/layout/page'
import { ControlledTabs } from 'web/components/layout/tabs'
import { GroupAbout } from 'web/components/groups/group-about'
import { getBlockGroupDropdownItem } from 'web/components/buttons/hide-group-button'
import { ENV_CONFIG, HOUSE_BOT_USERNAME } from 'common/envs/constants'
import { SimpleLinkButton } from 'web/components/buttons/simple-link-button'
import { Title } from 'web/components/widgets/title'
import Image from 'next/image'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import clsx from 'clsx'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { BanIcon } from '@heroicons/react/outline'
import { GroupOptions } from 'web/components/groups/group-options'
import { useIsMobile } from 'web/hooks/use-is-mobile'
export const groupButtonClass = 'text-gray-700 hover:text-gray-800'
export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const group = await getGroupBySlug(slugs[0])
  const memberIds = group && (await listMemberIds(group))
  const creatorPromise = group ? getUser(group.creatorId) : null

  const contracts =
    (group && (await listContractsByGroupSlug(group.slug))) ?? []
  const now = Date.now()
  const suggestedFilter =
    contracts.filter((c) => (c.closeTime ?? 0) > now).length < 5
      ? 'all'
      : 'open'
  const aboutPost =
    group && group.aboutPostId != null ? await getPost(group.aboutPostId) : null

  const messages = group && (await listAllCommentsOnGroup(group.id))

  const cachedTopTraderIds =
    (group && group.cachedLeaderboard?.topTraders) ?? []
  const cachedTopCreatorIds =
    (group && group.cachedLeaderboard?.topCreators) ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)

  const topCreators = await toTopUsers(cachedTopCreatorIds)

  const creator = await creatorPromise

  const posts = ((group && (await listPosts(group.postIds))) ?? []).filter(
    (p) => p != null
  ) as Post[]
  return {
    props: {
      group,
      memberIds,
      creator,
      topTraders,
      topCreators,
      messages,
      aboutPost,
      suggestedFilter,
      posts,
    },

    revalidate: 60, // regenerate after a minute
  }
}
export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const groupSubpages = [undefined, 'markets', 'about', 'leaderboards'] as const

export default function GroupPage(props: {
  group: Group | null
  memberIds: string[]
  creator: User | null
  topTraders: { user: User; score: number }[]
  topCreators: { user: User; score: number }[]
  messages: GroupComment[]
  aboutPost: Post | null
  suggestedFilter: 'open' | 'all'
  posts: Post[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    group: null,
    memberIds: [],
    creator: null,
    topTraders: [],
    topCreators: [],
    messages: [],
    suggestedFilter: 'open',
    posts: [],
  }
  const {
    creator,
    topTraders,
    topCreators,
    suggestedFilter,
    posts,
    memberIds,
  } = props

  const router = useRouter()

  const { slugs } = router.query as { slugs: string[] }
  const page = slugs?.[1] as typeof groupSubpages[number]
  const tabIndex = ['markets', 'about', 'leaderboards'].indexOf(
    page === 'about' ? 'about' : page ?? 'markets'
  )

  const group = useGroup(props.group?.id) ?? props.group
  const aboutPost = usePost(props.aboutPost?.id) ?? props.aboutPost

  let groupPosts = usePosts(group?.postIds ?? []) ?? posts

  if (aboutPost != null) {
    groupPosts = [aboutPost, ...groupPosts]
  }

  const user = useUser()
  const groupMembers = useMemberGroupsSubscription(user)
  const privateUser = usePrivateUser()
  const isAdmin = useAdmin()
  const isMember =
    groupMembers?.some((g) => g.id === group?.id) ??
    memberIds?.includes(user?.id ?? '_') ??
    false
  const [activeIndex, setActiveIndex] = useState(tabIndex)
  useEffect(() => {
    setActiveIndex(tabIndex)
  }, [tabIndex])

  useSaveReferral(user, {
    defaultReferrerUsername: creator?.username,
    groupId: group?.id,
  })

  if (group === null || !groupSubpages.includes(page) || slugs[2] || !creator) {
    return <Custom404 />
  }
  const isCreator = user && group && user.id === group.creatorId
  const maxLeaderboardSize = 50
  const groupUrl = `https://${ENV_CONFIG.domain}${groupPath(group.slug)}`

  const chatEmbed = <ChatEmbed group={group} />
  const isMobile = useIsMobile()

  return (
    <Page rightSidebar={chatEmbed}>
      <SEO
        title={group.name}
        description={`Created by ${creator.name}. ${group.about}`}
        url={groupPath(group.slug)}
      />
      {isMobile && (
        <TopGroupNavBar
          group={group}
          isMember={isMember}
          groupUrl={groupUrl}
          privateUser={privateUser}
          isBlocked={privateUser?.blockedGroupSlugs?.includes(group.slug)}
        />
      )}
      <figure className="relative h-60 w-full sm:h-80 ">
        <Image
          src={'/default_cover.jpeg'}
          alt=""
          fill
          // objectFit=""
        />
        <Row className="absolute bottom-0 w-full justify-between bg-white bg-opacity-80 px-4">
          <Title text={group.name} />
          <Row className="items-center gap-2">
            {isMobile && (
              <JoinOrLeaveGroupButton
                group={group}
                isMember={isMember}
                user={user}
              />
            )}
            {!isMobile && (
              <>
                <JoinOrLeaveGroupButton
                  group={group}
                  isMember={isMember}
                  user={user}
                />
                <GroupOptions
                  group={group}
                  groupUrl={groupUrl}
                  privateUser={privateUser}
                />
              </>
            )}
          </Row>
        </Row>
      </figure>
      <div className={'relative p-1 pt-0'}>
        <ControlledTabs
          activeIndex={activeIndex}
          onClick={(title, index) => {
            // concatenates the group slug with the subpage slug
            const path = `/group/${group.slug}/${
              groupSubpages[index + 1] ?? ''
            }`
            Router.push(path, undefined, { shallow: true })
            setActiveIndex(index)
          }}
          className={'mb-2'}
          tabs={[
            {
              title: 'Markets',
              content: (
                <ContractSearch
                  headerClassName="md:sticky"
                  defaultSort={'score'}
                  defaultFilter={suggestedFilter}
                  additionalFilter={{
                    groupSlug: group.slug,
                    facetFilters: getUsersBlockFacetFilters(privateUser, true),
                  }}
                  persistPrefix={`group-${group.slug}`}
                  includeProbSorts
                />
              ),
            },
            {
              title: 'About',
              content: (
                <GroupAbout
                  group={group}
                  posts={groupPosts}
                  isEditable={!!isCreator || isAdmin}
                  aboutPost={aboutPost}
                  creator={creator}
                  user={user}
                  isMember={isMember ?? false}
                />
              ),
            },
            {
              title: 'Leaderboards',
              content: (
                <Col>
                  <div className="mb-4 text-gray-500">
                    Updated every 15 minutes
                  </div>
                  <div className="mt-4 flex flex-col gap-8 px-4 md:flex-row">
                    <GroupLeaderboard
                      topUsers={topTraders}
                      title={`🏅 Top ${BETTORS}`}
                      header="Profit"
                      maxToShow={maxLeaderboardSize}
                    />
                    <GroupLeaderboard
                      topUsers={topCreators}
                      title="🏅 Top creators"
                      header="Number of traders"
                      maxToShow={maxLeaderboardSize}
                      noFormatting={true}
                    />
                  </div>
                </Col>
              ),
            },
          ]}
        />
      </div>
    </Page>
  )
}

export function TopGroupNavBar(props: {
  group: Group
  isMember: boolean | undefined
  groupUrl: string
  privateUser: PrivateUser | undefined | null
  isBlocked?: boolean
}) {
  const { group, isMember, groupUrl, privateUser, isBlocked } = props
  const user = useUser()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200">
      <Row className="items-center justify-between gap-2 bg-white px-2">
        <div className="flex flex-1">
          <Link
            href="/"
            className="py-4 px-2 text-indigo-700 hover:text-gray-500"
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
        <h1 className="truncate text-lg font-medium text-indigo-700">
          {props.group.name}
        </h1>
        <div className="flex flex-1 justify-end">
          <Row className="items-center gap-2">
            <JoinOrLeaveGroupButton
              group={group}
              isMember={isMember}
              user={user}
              isMobile={true}
            />
            <GroupOptions
              group={group}
              groupUrl={groupUrl}
              privateUser={privateUser}
            />
          </Row>
        </div>
      </Row>
    </header>
  )
}

// For now, just embed the DestinyGG chat embed on their group page
function ChatEmbed(props: { group: Group }) {
  const { group } = props
  const destinyGroupId = 'W2ES30fRo6CCbPNwMTTj'
  if (group.id === destinyGroupId) {
    return (
      <div className="h-[90vh]">
        <iframe
          src="https://www.destiny.gg/embed/chat"
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          allowFullScreen
        />
      </div>
    )
  }
  return null
}

function GroupLeaderboard(props: {
  topUsers: { user: User; score: number }[]
  title: string
  maxToShow: number
  header: string
  noFormatting?: boolean
}) {
  const { title, maxToShow, header, noFormatting } = props

  const topUsers = props.topUsers.filter(
    (u) => u.user.username !== HOUSE_BOT_USERNAME
  )
  const scoresByUser = topUsers.reduce((acc, { user, score }) => {
    acc[user.id] = score
    return acc
  }, {} as { [key: string]: number })

  return (
    <Leaderboard
      className="max-w-xl"
      entries={topUsers.map((t) => t.user)}
      title={title}
      columns={[
        {
          header,
          renderCell: (user) =>
            noFormatting
              ? scoresByUser[user.id]
              : formatMoney(scoresByUser[user.id]),
        },
      ]}
      maxToShow={maxToShow}
    />
  )
}

function AddContractButton(props: { group: Group; user: User }) {
  const { group, user } = props
  const [open, setOpen] = useState(false)
  const groupContractIds = useGroupContractIds(group.id)

  async function onSubmit(contracts: Contract[]) {
    await Promise.all(
      contracts.map((contract) => addContractToGroup(group, contract, user.id))
    )
  }

  return (
    <>
      <Button
        className="whitespace-nowrap"
        size="md"
        color="indigo"
        onClick={() => setOpen(true)}
      >
        Add markets
      </Button>

      <SelectMarketsModal
        open={open}
        setOpen={setOpen}
        title="Add markets"
        description={
          <div className={'text-md my-4 text-gray-600'}>
            Add pre-existing markets to this group, or{' '}
            <Link href={`/create?groupId=${group.id}`}>
              <span className="cursor-pointer font-semibold underline">
                create a new one
              </span>
            </Link>
            .
          </div>
        }
        submitLabel={(len) => `Add ${len} question${len !== 1 ? 's' : ''}`}
        onSubmit={onSubmit}
        contractSearchOptions={{
          additionalFilter: { excludeContractIds: groupContractIds },
        }}
      />
    </>
  )
}

const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: User; score: number }[]> =>
  (
    await Promise.all(
      cachedUserIds.map(async (e) => {
        const user = await getUser(e.userId)
        return { user, score: e.score ?? 0 }
      })
    )
  ).filter((e) => e.user != null)
