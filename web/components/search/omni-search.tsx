import { Combobox } from '@headlessui/react'
import { ChevronRightIcon } from '@heroicons/react/outline'
import { SparklesIcon, UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { debounce, startCase, uniqBy } from 'lodash'
import { useRouter } from 'next/router'
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useRealtimeMemberGroupIds } from 'web/hooks/use-group-supabase'
import { useUser } from 'web/hooks/use-user'
import { useYourRecentContracts } from 'web/hooks/use-your-daily-changed-contracts'
import { searchContract } from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'
import { UserSearchResult, searchUsers } from 'web/lib/supabase/users'
import { ContractStatusLabel } from '../contract/contracts-table'
import { JoinOrLeaveGroupButton } from '../groups/groups-button'
import { SORTS, Sort } from '../supabase-search'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { searchMarketSorts } from './query-market-sorts'
import { PageData, defaultPages, searchPages } from './query-pages'
import { useSearchContext } from './search-context'

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
}) => {
  const { className, inputClassName, query, setQuery, onSelect } = props

  const { setOpen } = useSearchContext() ?? {}
  const router = useRouter()

  const [debouncedQuery, setDebouncedQuery] = useState(query)

  const debouncedSearch = useCallback(
    debounce((newQuery) => setDebouncedQuery(newQuery), 50),
    []
  )

  useEffect(() => {
    debouncedSearch(query)
  }, [query])

  return (
    <Combobox
      as="div"
      onChange={({ slug }: Option) => {
        router.push(slug)
        setOpen?.(false)
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
              if (e.key === 'Escape') setOpen?.(false)
              if (e.key === 'Enter' && !activeOption) {
                router.push(marketSearchSlug(query))
                setOpen?.(false)
                onSelect?.()
              }
            }}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions, users, & groups"
            enterKeyHint="search"
            className={clsx(
              'border-ink-100 focus:border-ink-100 placeholder:text-ink-400 bg-canvas-0 text-ink-1000 border-0 border-b py-4 px-6 text-xl ring-0 ring-transparent focus:ring-transparent',
              inputClassName
            )}
          />
          <Combobox.Options
            static
            className="text-ink-700 flex flex-col overflow-y-auto px-1"
          >
            {debouncedQuery ? (
              <Results query={debouncedQuery} />
            ) : (
              <DefaultResults />
            )}
          </Combobox.Options>
        </>
      )}
    </Combobox>
  )
}

const DefaultResults = () => {
  const user = useUser()
  const markets = useYourRecentContracts(db, user?.id) ?? []

  return (
    <>
      <MarketResults markets={markets} />
      <PageResults pages={defaultPages} />
      <div className="mx-2 my-2 text-xs">
        <SparklesIcon className="text-primary-500 mr-1 inline h-4 w-4 align-text-bottom" />
        Start with <Key>%</Key> for questions, <Key>@</Key> for users, or{' '}
        <Key>#</Key> for groups
      </div>
    </>
  )
}

const Key = (props: { children: ReactNode }) => (
  <code className="bg-ink-300 mx-0.5 rounded p-0.5">{props.children}</code>
)

const Results = (props: { query: string }) => {
  const { query } = props

  const prefix = query.match(/^(%|#|@)/) ? query.charAt(0) : ''
  const search = prefix ? query.slice(1) : query

  const userHitLimit = !prefix ? 2 : prefix === '@' ? 25 : 0
  const groupHitLimit = !prefix ? 2 : prefix === '#' ? 25 : 0
  const marketHitLimit = !prefix ? 5 : prefix === '%' ? 25 : 0

  const [
    { pageHits, userHits, groupHits, sortHit, marketHits },
    setSearchResults,
  ] = useState({
    pageHits: [] as PageData[],
    userHits: [] as UserSearchResult[],
    groupHits: [] as Group[],
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
      searchUsers(search, userHitLimit),
      searchGroups({ term: search, limit: groupHitLimit }),
      searchContract({
        query: search,
        filter: 'all',
        sort: 'score',
        limit: marketHitLimit,
      }),
      (async () => {
        const sortHits = prefix ? [] : searchMarketSorts(search)
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

      if (thisNonce === nonce.current) {
        const pageHits = prefix ? [] : searchPages(search, 2)
        const uniqueMarketHits = uniqBy<Contract>(marketHits, 'id')
        const uniqueGroupHits = uniqBy<Group>(groupHits, 'id')
        setSearchResults({
          pageHits,
          userHits,
          groupHits: uniqueGroupHits,
          sortHit,
          marketHits: uniqueMarketHits,
        })
        setLoading(false)
      }
    })
  }, [search, groupHitLimit, marketHitLimit, userHitLimit, prefix])

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
    !groupHits.length &&
    !marketHits.length
  ) {
    return <div className="my-6 text-center">no results x.x</div>
  }

  return (
    <>
      <PageResults pages={pageHits} />
      <MarketResults markets={marketHits} search={search} />
      <GroupResults groups={groupHits} search={search} />
      <UserResults users={userHits} search={search} />
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

const MarketResults = (props: { markets: Contract[]; search?: string }) => {
  const markets = props.markets

  return (
    <>
      <SectionTitle link={marketSearchSlug(props.search ?? '')}>
        Questions
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

const UserResults = (props: { users: UserSearchResult[]; search?: string }) => {
  if (!props.users.length) return null
  return (
    <>
      <SectionTitle
        link={`/users?search=${encodeURIComponent(props.search ?? '')}`}
      >
        Users
      </SectionTitle>
      {props.users.map(({ id, name, username, avatarUrl }) => (
        <ResultOption value={{ id, slug: `/${username}` }}>
          <div className="flex items-center gap-2">
            <Avatar
              username={username}
              avatarUrl={avatarUrl}
              size="xs"
              noLink
            />
            {name}
            {username !== name && (
              <span className="text-ink-400 line-clamp-1">@{username}</span>
            )}
          </div>
        </ResultOption>
      ))}
    </>
  )
}

const GroupResults = (props: {
  groups: SearchGroupInfo[]
  search?: string
}) => {
  const me = useUser()
  const myGroups = useRealtimeMemberGroupIds(me) || []
  const { search } = props
  if (!props.groups.length) return null
  return (
    <>
      <SectionTitle link={`/groups?search=${encodeURIComponent(search ?? '')}`}>
        Groups
      </SectionTitle>
      {props.groups.map((group) => (
        <ResultOption value={{ id: group.id, slug: `/group/${group.slug}` }}>
          <div className="flex items-center gap-3">
            <span className="line-clamp-1 grow">{group.name}</span>
            <span className="flex items-center">
              <UsersIcon className="mr-1 h-4 w-4" />
              {group.totalMembers}
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              <JoinOrLeaveGroupButton
                group={group}
                user={me}
                isMember={myGroups.includes(group.id)}
                className="w-[80px] !px-0 !py-1"
              />
            </div>
          </div>
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
  `/questions?s=score&f=all&q=${encodeURIComponent(query)}`
