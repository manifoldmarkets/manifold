import clsx from 'clsx'
import { User } from '../lib/firebase/users'
import { CreatorContractsList } from './contract/contracts-list'
import { SEO } from './SEO'
import { Page } from './page'
import { SiteLink } from './site-link'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { Linkify } from './linkify'
import { Spacer } from './layout/spacer'
import { Row } from './layout/row'
import { LinkIcon } from '@heroicons/react/solid'
import { genHash } from '../../common/util/random'
import { PencilIcon } from '@heroicons/react/outline'
import { Tabs } from './layout/tabs'
import { UserCommentsList } from './comments-list'
import { useEffect, useState } from 'react'
import { Comment, getUsersComments } from '../lib/firebase/comments'
import { Contract } from '../../common/contract'
import { getContractFromId, listContracts } from '../lib/firebase/contracts'
import { LoadingIndicator } from './loading-indicator'
import { useRouter } from 'next/router'
import _ from 'lodash'

export function UserLink(props: {
  name: string
  username: string
  showUsername?: boolean
  className?: string
}) {
  const { name, username, showUsername, className } = props

  return (
    <SiteLink href={`/${username}`} className={clsx('z-10', className)}>
      {name}
      {showUsername && ` (@${username})`}
    </SiteLink>
  )
}

export function UserPage(props: {
  user: User
  currentUser?: User
  defaultTabTitle?: string
}) {
  const router = useRouter()
  const { user, currentUser, defaultTabTitle } = props
  const isCurrentUser = user.id === currentUser?.id
  const bannerUrl = user.bannerUrl ?? defaultBannerUrl(user.id)
  const [usersComments, setUsersComments] = useState<Comment[]>([] as Comment[])
  const [usersContracts, setUsersContracts] = useState<Contract[] | 'loading'>(
    'loading'
  )
  const [commentsByContract, setCommentsByContract] = useState<
    Map<Contract, Comment[]> | 'loading'
  >('loading')

  useEffect(() => {
    if (!user) return
    getUsersComments(user.id).then(setUsersComments)
    listContracts(user.id).then(setUsersContracts)
  }, [user])

  useEffect(() => {
    const uniqueContractIds = _.uniq(
      usersComments.map((comment) => comment.contractId)
    )
    Promise.all(
      uniqueContractIds.map((contractId) => getContractFromId(contractId))
    ).then((contracts) => {
      const commentsByContract = new Map<Contract, Comment[]>()
      contracts.forEach((contract) => {
        if (!contract) return
        commentsByContract.set(
          contract,
          usersComments.filter((comment) => comment.contractId === contract.id)
        )
      })
      setCommentsByContract(commentsByContract)
    })
  }, [usersComments])

  return (
    <Page>
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />

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
            size={20}
            className="bg-white ring-4 ring-white"
          />
        </div>

        {/* Top right buttons (e.g. edit, follow) */}
        <div className="absolute right-0 top-0 mt-4 mr-4">
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

        {user.bio && (
          <>
            <Spacer h={4} />
            <div>
              <Linkify text={user.bio}></Linkify>
            </div>
            <Spacer h={4} />
          </>
        )}

        <Col className="sm:flex-row sm:gap-4">
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
        {usersContracts !== 'loading' && commentsByContract != 'loading' ? (
          <Tabs
            className={'pb-2 pt-1 '}
            defaultIndex={defaultTabTitle === 'Comments' ? 1 : 0}
            onClick={(tabName) =>
              router.push(
                {
                  pathname: `/${user.username}`,
                  query: { tab: tabName },
                },
                undefined,
                { shallow: true }
              )
            }
            tabs={[
              {
                title: 'Markets',
                content: <CreatorContractsList contracts={usersContracts} />,
                tabIcon: (
                  <div
                    className={clsx(
                      usersContracts.length > 9 ? 'px-1' : 'px-1.5',
                      'items-center rounded-full border-2 border-current py-0.5 text-xs'
                    )}
                  >
                    {usersContracts.length}
                  </div>
                ),
              },
              {
                title: 'Comments',
                content: (
                  <UserCommentsList
                    user={user}
                    commentsByUniqueContracts={commentsByContract}
                  />
                ),
                tabIcon: (
                  <div
                    className={clsx(
                      usersComments.length > 9 ? 'px-1' : 'px-1.5',
                      'items-center rounded-full border-2 border-current py-0.5 text-xs'
                    )}
                  >
                    {usersComments.length}
                  </div>
                ),
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
