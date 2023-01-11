import { Combobox } from '@headlessui/react'
import { UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useRouter } from 'next/router'
import { ReactNode, useState } from 'react'
import { useTrendingContracts } from 'web/hooks/use-contracts'
import { getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { SearchGroupInfo } from 'web/lib/supabase/groups'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
import { useMarketSearchResults } from './query-contracts'
import { useGroupSearchResults } from './query-groups'
import { PageData, searchPages } from './query-pages'
import { useUserSearchResults } from './query-users'
import { useSearchContext } from './search-context'

export interface Option {
  id: string
  slug: string
}

export const OmniSearch = () => {
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
      className="flex max-h-full flex-col overflow-hidden rounded-2xl bg-white"
    >
      <Combobox.Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search markets, users, & groups"
        className="border-0 border-b !border-gray-100 py-4 px-6 text-xl ring-0 placeholder:text-gray-400 focus:ring-transparent"
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
  const markets = useTrendingContracts(7) ?? []
  return (
    <>
      <MarketResults markets={markets} />
      <div className="mx-2 my-2 text-xs">
        <span className="uppercase text-teal-500">💹 Protip:</span> Start
        searches with <Key>%</Key> <Key>@</Key> <Key>#</Key> to narrow results
      </div>
    </>
  )
}

const Key = (props: { children: ReactNode }) => (
  <code className="rounded bg-gray-300 p-0.5">{props.children}</code>
)

const Results = (props: { query: string }) => {
  const { query } = props

  const prefix = query.match(/^(%|#|@)/) ? query.charAt(0) : ''
  const search = prefix ? query.slice(1) : query

  const userHits = useUserSearchResults(
    search,
    !prefix ? 2 : prefix === '@' ? 25 : 0
  )
  const groupHits = useGroupSearchResults(
    search,
    !prefix ? 2 : prefix === '#' ? 25 : 0
  )
  const marketHits = useMarketSearchResults(
    search,
    !prefix ? 20 : prefix === '%' ? 25 : 0
  )

  const pageHits = prefix ? [] : searchPages(query, 2)

  return (
    <>
      <PageResults pages={pageHits} />
      <UserResults users={userHits} />
      <GroupResults groups={groupHits} />
      <MarketResults markets={marketHits} />
    </>
  )
}

const SectionTitle = (props: { children: ReactNode }) => (
  <h2 className="mt-1 text-sm text-gray-500">{props.children}</h2>
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

const UserResults = (props: { users: User[] }) => {
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
