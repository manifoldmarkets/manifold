import { Combobox } from '@headlessui/react'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode, useState } from 'react'
import { useTrendingContracts } from 'web/hooks/use-contracts'
import { getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
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
      onChange={(option: Option) => {
        setOpen?.(false)
        option && router.push(option.slug)
      }}
      className="flex h-full flex-col"
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
        className="flex flex-1 flex-col overflow-y-auto px-2 text-gray-700"
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
      <div className="grow" />
      <div className="columns-2 px-10 pb-6">
        <Col>
          <DefaultLink href="/groups">Groups</DefaultLink>
          <DefaultLink href="/add-funds">Get Mana</DefaultLink>
          <DefaultLink href="/labs">Labs</DefaultLink>
        </Col>
        <Col>
          <DefaultLink href="">Blog</DefaultLink>
          <DefaultLink href="https://discord.com/invite/eHQBNBqXuh">
            Discord
          </DefaultLink>
          <DefaultLink href="https://help.manifold.markets">
            Help & About
          </DefaultLink>
        </Col>
      </div>
    </>
  )
}

const DefaultLink = (props: { href: string; children: string }) => (
  <Link
    className="my-1 text-sm text-indigo-500 decoration-indigo-300 hover:underline"
    href={props.href}
  >
    {props.children}
  </Link>
)

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
          'mb-1 rounded-md px-3 py-2',
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
