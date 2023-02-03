import { Combobox } from '@headlessui/react'
import { SearchIcon, UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { useRouter } from 'next/router'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useTrendingContracts } from 'web/hooks/use-contracts'
import { getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { searchContracts } from 'web/lib/service/algolia'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'
import { searchUsers, UserSearchResult } from 'web/lib/supabase/users'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { defaultPages, PageData, searchPages } from './query-pages'
import { useSearchContext } from './search-context'

export interface Option {
  id: string
  slug: string
}

export const OmniSearch = (props: {
  className?: string
  inputClassName?: string
}) => {
  const { className, inputClassName } = props

  const [query, setQuery] = useState('')

  const { setOpen } = useSearchContext() ?? {}
  const router = useRouter()

  return (
    <Combobox
      as="div"
      onChange={({ slug }: Option) => {
        setOpen?.(false)
        router.push(slug)
      }}
      className={clsx('relative flex flex-col bg-white', className)}
    >
      <Combobox.Input
        autoFocus
        value={query}
        onKeyDown={(e: any) => {
          if (e.key === 'Escape') setOpen?.(false)
        }}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search markets, users, & groups"
        className={clsx(
          'border-0 border-b !border-gray-100 py-4 px-6 text-xl ring-0 ring-transparent placeholder:text-gray-400 focus:ring-transparent',
          inputClassName
        )}
      />
      <Combobox.Options
        static
        className="flex flex-col overflow-y-auto px-2 text-gray-700"
      >
        {query ? <Results query={query} /> : <DefaultResults />}
      </Combobox.Options>
    </Combobox>
  )
}

const DefaultResults = () => {
  const markets = useTrendingContracts(5) ?? []

  return (
    <>
      <PageResults pages={defaultPages} />
      <MarketResults markets={markets} />
      <div className="mx-2 my-2 text-xs">
        <span className="uppercase text-teal-500">💹 Protip:</span> Start search
        with <Key>%</Key> for markets, <Key>@</Key> for users, or <Key>#</Key>{' '}
        for groups
      </div>
    </>
  )
}

const Key = (props: { children: ReactNode }) => (
  <code className="mx-0.5 rounded bg-gray-300 p-0.5">{props.children}</code>
)

const Results = (props: { query: string }) => {
  const { query } = props

  const prefix = query.match(/^(%|#|@)/) ? query.charAt(0) : ''
  const search = prefix ? query.slice(1) : query

  const userHitLimit = !prefix ? 2 : prefix === '@' ? 25 : 0
  const groupHitLimit = !prefix ? 2 : prefix === '#' ? 25 : 0
  const marketHitLimit = !prefix ? 20 : prefix === '%' ? 25 : 0

  const [{ pageHits, userHits, groupHits, marketHits }, setSearchResults] =
    useState({
      pageHits: [] as PageData[],
      userHits: [] as UserSearchResult[],
      groupHits: [] as SearchGroupInfo[],
      marketHits: [] as Contract[],
    })
  const [loading, setLoading] = useState(false)

  // Use nonce to make sure only latest result gets used.
  const nonce = useRef(0)

  useEffect(() => {
    nonce.current++
    const thisNonce = nonce.current
    setLoading(true)

    Promise.all([
      searchUsers(search, userHitLimit),
      searchGroups(search, groupHitLimit),
      searchContracts(search, marketHitLimit),
    ]).then(([userHits, groupHits, marketHits]) => {
      if (thisNonce === nonce.current) {
        const pageHits = prefix ? [] : searchPages(search, 2)
        setSearchResults({ pageHits, userHits, groupHits, marketHits })
        setLoading(false)
      }
    })
  }, [search, groupHitLimit, marketHitLimit, userHitLimit, prefix])

  if (loading) {
    return (
      <LoadingIndicator
        className="absolute right-6 bottom-1/2 translate-y-1/2"
        spinnerClassName="!border-gray-300 !border-r-transparent"
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
      {marketHits.length > 0 && <MoreMarketResults search={search} />}
      <PageResults pages={pageHits} />
      <UserResults users={userHits} />
      <GroupResults groups={groupHits} />
      <MarketResults markets={marketHits} />
    </>
  )
}

const SectionTitle = (props: { children: ReactNode }) => (
  <h2 className="mt-2 mb-1 px-1 text-sm text-gray-500">{props.children}</h2>
)

const ResultOption = (props: { value: Option; children: ReactNode }) => (
  <Combobox.Option value={props.value}>
    {({ active }) => (
      <div
        className={clsx(
          'mb-1 cursor-pointer select-none rounded-md px-3 py-2',
          active && 'bg-indigo-100 text-indigo-800'
        )}
      >
        {props.children}
      </div>
    )}
  </Combobox.Option>
)

const MarketResults = (props: { markets: Contract[] }) => {
  const markets = props.markets
  if (!markets.length) return null

  return (
    <>
      <SectionTitle>Markets</SectionTitle>
      {props.markets.map((market) => (
        <ResultOption
          value={{
            id: market.id,
            slug: `/${market.creatorUsername}/${market.slug}`,
          }}
        >
          {market.question}
          {market.outcomeType === 'BINARY' && (
            <span className="ml-2 font-bold">
              {market.resolution ? (
                <BinaryContractOutcomeLabel
                  contract={market}
                  resolution={market.resolution}
                />
              ) : (
                getBinaryProbPercent(market)
              )}
            </span>
          )}
        </ResultOption>
      ))}
    </>
  )
}

const UserResults = (props: { users: UserSearchResult[] }) => {
  if (!props.users.length) return null
  return (
    <>
      <SectionTitle>Users</SectionTitle>
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
              <span className="font-light">@{username}</span>
            )}
          </div>
        </ResultOption>
      ))}
    </>
  )
}

const GroupResults = (props: { groups: SearchGroupInfo[] }) => {
  if (!props.groups.length) return null
  return (
    <>
      <SectionTitle>Groups</SectionTitle>
      {props.groups.map(({ id, name, slug, totalMembers }) => (
        <ResultOption value={{ id, slug: `/group/${slug}` }}>
          <div className="flex items-center">
            <span className="mr-3">{name}</span>
            <UsersIcon className="mr-1 h-4 w-4" />
            {totalMembers}
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
      <SectionTitle>Pages</SectionTitle>
      {props.pages.map(({ label, slug }) => (
        <ResultOption value={{ id: label, slug }}>{label}</ResultOption>
      ))}
    </>
  )
}

const MoreMarketResults = (props: { search: string }) => {
  return (
    <ResultOption
      value={{
        id: 'more',
        slug: `/search?s=relevance&f=all&q=${encodeURIComponent(props.search)}`,
      }}
    >
      <div className="flex items-center text-sm">
        <SearchIcon className="mr-3 h-5 w-5" />
        Browse all markets for
        <span className="ml-1 italic">"{props.search}"</span>
      </div>
    </ResultOption>
  )
}
