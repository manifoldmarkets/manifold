import { Combobox } from '@headlessui/react'
import { ChevronRightIcon } from '@heroicons/react/outline'
import { SparklesIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { TOPIC_KEY, Group } from 'common/group'
import { debounce, startCase, uniqBy } from 'lodash'
import { useRouter } from 'next/router'
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useMemberGroupIds } from 'web/hooks/use-group-supabase'
import { useUser } from 'web/hooks/use-user'
import { useYourRecentContracts } from 'web/hooks/use-your-daily-changed-contracts'
import { searchContract } from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'
import { UserSearchResult, searchUsers } from 'web/lib/supabase/users'
import { ContractStatusLabel } from '../contract/contracts-table'
import { JoinOrLeaveGroupButton } from '../groups/groups-button'
import { SORTS, Sort } from '../contracts-search'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { searchMarketSorts } from './query-market-sorts'
import { PageData, searchPages } from './query-pages'
import { PillButton } from 'web/components/buttons/pill-button'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { formatLargeNumber } from 'common/util/format'
import { FollowButton } from 'web/components/buttons/follow-button'

export interface Option {
  id: string
  slug: string
}

export const OmniSearch = (props: {
  className?: string
  inputClassName?: string
  query: string
  setQuery: (query: string) => void
  onSelect?: () => void
  onFinished?: () => void
}) => {
  const { className, inputClassName, query, setQuery, onSelect, onFinished } =
    props

  const router = useRouter()
  const user = useUser()
  const recentMarkets = useYourRecentContracts(db, user?.id) ?? []
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  const debouncedSearch = useCallback(
    debounce((newQuery) => setDebouncedQuery(newQuery), 50),
    []
  )
  const pillOptions = ['All', 'Questions', 'Users', 'Topics']
  const [filter, setFilter] = useState(pillOptions[0])

  useEffect(() => {
    debouncedSearch(query)
  }, [query])

  return (
    <Combobox
      as="div"
      onChange={({ slug }: Option) => {
        router.push(slug)
        onFinished?.()
        onSelect?.()
      }}
      className={clsx('bg-canvas-0 relative flex flex-col', className)}
    >
      {({ activeOption }) => (
        <>
          <Combobox.Input
            autoFocus
            value={query}
            onKeyDown={(e: any) => {
              if (e.key === 'Escape') onFinished?.()
              if (e.key === 'Enter' && !activeOption) {
                router.push(marketSearchSlug(query))
                onFinished?.()
                onSelect?.()
              }
            }}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions, users, & topics"
            enterKeyHint="search"
            className={clsx(
              'border-ink-100 focus:border-ink-100 placeholder:text-ink-400 bg-canvas-0 text-ink-1000 border-0 border-b py-4 px-6 text-xl ring-0 ring-transparent focus:ring-transparent',
              inputClassName
            )}
          />
          <Row className={'mx-4 my-1 gap-2'}>
            {query &&
              pillOptions.map((option) => (
                <PillButton
                  key={option}
                  selected={filter === option}
                  onSelect={() => setFilter(option)}
                >
                  {option}
                </PillButton>
              ))}
          </Row>
          <Combobox.Options
            static
            className="text-ink-700 flex flex-col overflow-y-auto px-1"
          >
            {debouncedQuery ? (
              <Results
                query={debouncedQuery}
                recentMarkets={recentMarkets}
                filter={filter}
              />
            ) : (
              <DefaultResults recentMarkets={recentMarkets} />
            )}
          </Combobox.Options>
        </>
      )}
    </Combobox>
  )
}

const DefaultResults = (props: { recentMarkets: Contract[] }) => {
  const { recentMarkets } = props
  return (
    <>
      <MarketResults
        title={'Recent questions'}
        markets={recentMarkets.slice(0, 7)}
      />

      <div className="mx-2 my-2 text-xs">
        <SparklesIcon className="text-primary-500 mr-1 inline h-4 w-4 align-text-bottom" />
        Start with <Key>%</Key> for questions, <Key>@</Key> for users, or{' '}
        <Key>#</Key> for topics
      </div>
    </>
  )
}

const Key = (props: { children: ReactNode }) => (
  <code className="bg-ink-300 mx-0.5 rounded p-0.5">{props.children}</code>
)

const Results = (props: {
  query: string
  recentMarkets: Contract[]
  filter: string
}) => {
  const { query, recentMarkets, filter } = props

  const search = query
  const all = filter === 'All'
  const justUsers = filter === 'Users'
  const justGroups = filter === 'Topics'
  const justMarkets = filter === 'Questions'

  const userHitLimit = justUsers ? 50 : all ? 5 : 0
  const groupHitLimit = justGroups ? 50 : all ? 2 : 0
  const marketHitLimit = justMarkets ? 25 : all ? 5 : 0

  const [
    { pageHits, userHits, topicHits, sortHit, marketHits },
    setSearchResults,
  ] = useState({
    pageHits: [] as PageData[],
    userHits: [] as UserSearchResult[],
    topicHits: [] as Group[],
    sortHit: null as { sort: Sort; markets: Contract[] } | null,
    marketHits: [] as Contract[],
  })
  const [loading, setLoading] = useState(false)

  // Use nonce to make sure only latest result gets used.
  const nonce = useRef(0)

  useEffect(() => {
    nonce.current++
    const thisNonce = nonce.current
    setLoading(true)

    Promise.allSettled([
      searchUsers(search, userHitLimit, ['creatorTraders', 'bio']),
      // add your groups via ilike on top
      searchGroups({ term: search, limit: groupHitLimit }),
      searchContract({
        query: search,
        filter: 'all',
        sort: 'score',
        limit: marketHitLimit,
      }),
      (async () => {
        const sortHits = !all ? [] : searchMarketSorts(search)
        const sort = sortHits[0]
        if (sortHits.length) {
          const markets = (
            await searchContract({
              query: '',
              filter: 'all',
              sort: sort,
              limit: 3,
            })
          ).data
          return { sort, markets }
        }
        return null
      })(),
    ]).then(([u, g, m, s]) => {
      const userHits = u.status === 'fulfilled' ? u.value : []
      const groupHits = g.status === 'fulfilled' ? g.value.data : []
      const marketHits = m.status === 'fulfilled' ? m.value.data : []
      const sortHit = s.status === 'fulfilled' ? s.value : null
      const recentMarketHits =
        all || justMarkets
          ? recentMarkets.filter((m) =>
              m.question.toLowerCase().includes(search.toLowerCase())
            )
          : []

      if (thisNonce === nonce.current) {
        const pageHits = !all ? [] : searchPages(search, 2)
        const uniqueMarketHits = uniqBy<Contract>(
          recentMarketHits.concat(marketHits),
          'id'
        )
        const uniqueTopicHits = uniqBy<Group>(groupHits, 'id')
        setSearchResults({
          pageHits,
          userHits,
          topicHits: uniqueTopicHits,
          sortHit,
          marketHits: uniqueMarketHits,
        })
        setLoading(false)
      }
    })
  }, [search, groupHitLimit, marketHitLimit, userHitLimit, all])

  if (loading) {
    return (
      <LoadingIndicator
        className="absolute right-6 bottom-1/2 translate-y-1/2"
        spinnerClassName="!border-ink-300 !border-r-transparent"
      />
    )
  }

  if (
    !pageHits.length &&
    !userHits.length &&
    !topicHits.length &&
    !marketHits.length
  ) {
    return <div className="my-6 text-center">no results x.x</div>
  }

  return (
    <>
      <PageResults pages={pageHits} />
      {marketHitLimit > 0 && (
        <MarketResults markets={marketHits} search={search} />
      )}
      {groupHitLimit > 0 && <TopicResults topics={topicHits} />}
      {userHitLimit > 0 && <UserResults users={userHits} />}
      {sortHit && <MarketSortResults {...sortHit} />}
    </>
  )
}

const SectionTitle = (props: { children: ReactNode; link?: string }) => {
  const { children, link } = props
  return (
    <h2 className="text-ink-800 mt-2 font-semibold first:mt-0">
      {link ? (
        <ResultOption
          value={{ id: link, slug: link }}
          className="!mb-0 flex items-center justify-between !px-2 !py-1"
        >
          {children}
          <ChevronRightIcon className="h-5 w-5" />
        </ResultOption>
      ) : (
        <div className="px-2 py-1">{children}</div>
      )}
    </h2>
  )
}

const ResultOption = (props: {
  value: Option
  children: ReactNode
  className?: string
}) => {
  const { value, children, className } = props

  return (
    <Combobox.Option value={value}>
      {({ active }) => (
        <div
          // modify click event before it bubbles higher to trick Combobox into thinking this is a normal click event
          onClick={(e) => {
            e.defaultPrevented = false
          }}
        >
          <a
            className={clsx(
              'mb-1 block cursor-pointer select-none rounded-md px-3 py-2',
              active && 'bg-primary-100 text-primary-800',
              className
            )}
            onClick={(e) => {
              if (e.ctrlKey || e.shiftKey || e.metaKey || e.button === 1) {
                // if openned in new tab/window don't switch this page
                e.stopPropagation()
              } else {
                // if click normally, don't hard refresh. Let Combobox onChange handle routing instead of this <a>
                e.preventDefault()
              }
              return true
            }}
            href={value.slug}
          >
            {children}
          </a>
        </div>
      )}
    </Combobox.Option>
  )
}

const MarketResults = (props: {
  markets: Contract[]
  title?: string
  search?: string
}) => {
  const { markets, title } = props

  return (
    <>
      <SectionTitle link={marketSearchSlug(props.search ?? '')}>
        {title ?? 'Questions'}
      </SectionTitle>
      {markets.map((market) => (
        <MarketResult key={market.id} market={market} />
      ))}
    </>
  )
}

const MarketResult = (props: { market: Contract }) => {
  const market = props.market
  return (
    <ResultOption
      value={{
        id: market.id,
        slug: `/${market.creatorUsername}/${market.slug}`,
      }}
    >
      <div className="flex gap-2">
        <span className="line-clamp-2 grow">{market.question}</span>
        <span className="font-bold">
          <ContractStatusLabel contract={market} />
        </span>
        <Avatar
          size="xs"
          username={market.creatorUsername}
          avatarUrl={market.creatorAvatarUrl}
        />
      </div>
    </ResultOption>
  )
}

const UserResults = (props: { users: UserSearchResult[] }) => {
  const title = <SectionTitle>Users</SectionTitle>
  if (!props.users.length) return title
  return (
    <>
      {title}
      {props.users.map(
        ({ id, name, username, avatarUrl, bio, creatorTraders }) => (
          <ResultOption key={id} value={{ id, slug: `/${username}` }}>
            <Col>
              <Row>
                <Row className={'w-full flex-wrap items-center gap-2'}>
                  <Avatar
                    username={username}
                    avatarUrl={avatarUrl}
                    size="xs"
                    noLink
                  />
                  {name}
                  {username !== name && (
                    <span className="text-ink-400 line-clamp-1">
                      @{username}
                    </span>
                  )}
                </Row>
                <FollowButton size={'xs'} userId={id} />
              </Row>
              <div className={'line-clamp-1 text-ink-500 text-sm'}>
                {creatorTraders.allTime > 0 && (
                  <span className={'mr-1'}>
                    {formatLargeNumber(creatorTraders.allTime)} traders
                    {bio && ' •'}
                  </span>
                )}

                <span>{bio}</span>
              </div>
            </Col>
          </ResultOption>
        )
      )}
    </>
  )
}

const TopicResults = (props: { topics: SearchGroupInfo[] }) => {
  const me = useUser()
  const myGroupIds = useMemberGroupIds(me?.id) ?? []

  const title = <SectionTitle>Topics</SectionTitle>
  if (!props.topics.length) return title
  return (
    <>
      {title}
      {props.topics.map((group) => (
        <ResultOption
          key={group.id}
          value={{
            id: group.id,
            slug: `/questions?${TOPIC_KEY}=${group.slug}`,
          }}
        >
          <Row>
            <Col className={'w-full'}>
              <span className="line-clamp-1 ">{group.name}</span>
              {group.totalMembers > 1 && (
                <span className={'text-ink-500 text-sm'}>
                  {group.totalMembers} followers
                </span>
              )}
            </Col>
            <div onClick={(e) => e.stopPropagation()}>
              <JoinOrLeaveGroupButton
                group={group}
                user={me}
                isMember={myGroupIds.includes(group.id)}
              />
            </div>
          </Row>
        </ResultOption>
      ))}
    </>
  )
}

const PageResults = (props: { pages: PageData[] }) => {
  if (!props.pages.length) return null
  return (
    <>
      {props.pages.map(({ label, slug }) => (
        <SectionTitle link={slug} key={label}>
          {label}
        </SectionTitle>
      ))}
    </>
  )
}

const MarketSortResults = (props: { sort: Sort; markets: Contract[] }) => {
  const { sort, markets } = props
  if (!sort) return null

  const casedLabel = startCase(SORTS.find((s) => s.value === sort)?.label)

  const label = [
    'newest',
    'score',
    'liquidity',
    'close-date',
    'resolve-date',
  ].includes(sort)
    ? casedLabel + ' Questions'
    : 'Questions by ' + casedLabel

  return (
    <>
      <SectionTitle link={`/questions?s=${sort}`}>{label}</SectionTitle>
      <div className="flex">
        <div className="bg-ink-200 my-1 ml-2 mr-3 w-1" />
        <div className="flex flex-col gap-2">
          {markets.map((market) => (
            <MarketResult key={market.id} market={market} />
          ))}
        </div>
      </div>
    </>
  )
}

const marketSearchSlug = (query: string) =>
  `/questions?s=score&f=all&q=${query}`
