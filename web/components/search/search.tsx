import { Combobox } from '@headlessui/react'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useRouter } from 'next/router'
import { ReactNode, useState } from 'react'
import { useTrendingContracts } from 'web/hooks/use-contracts'
import { getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
import { useMarketSearchResults } from './query-contracts'
import { useUserSearchResults } from './query-users'
import { useSearchContext } from './search-context'

export interface Option {
  id: string
  slug: string
}

export const OmniSearch = () => {
  const [query, setQuery] = useState('')
  // const [selected, setSelected] = useState<Option>()

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
        placeholder="Search markets, users, groups"
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
  const contracts = useTrendingContracts(7)
  return (
    <>
      {contracts?.map((c) => (
        <MarketResult market={c} />
      ))}
    </>
  )
}

const Results = (props: { query: string }) => {
  const { query } = props

  const userHits = useUserSearchResults(query)
  const marketHits = useMarketSearchResults(query)

  return (
    <div>
      {userHits.length ? <SectionTitle>Users</SectionTitle> : null}
      {userHits.map((user) => (
        <UserResult user={user} />
      ))}
      {marketHits.length ? <SectionTitle>Markets</SectionTitle> : null}
      {marketHits.map((market) => (
        <MarketResult market={market} />
      ))}
    </div>
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

const MarketResult = (props: { market: Contract }) => {
  const market = props.market
  return (
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
  )
}

const UserResult = (props: { user: User }) => {
  const { id, name, username, avatarUrl } = props.user
  return (
    <ResultOption value={{ id, slug: `/${username}` }}>
      <div className="flex items-center gap-2">
        <Avatar username={username} avatarUrl={avatarUrl} size="xs" noLink />
        {name}
        {username !== name && <span className="font-light">@{username}</span>}
      </div>
    </ResultOption>
  )
}
