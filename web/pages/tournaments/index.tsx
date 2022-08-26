import { ClockIcon } from '@heroicons/react/outline'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  UsersIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import dayjs, { Dayjs } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { keyBy, mapValues, throttle } from 'lodash'
import Link from 'next/link'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { ContractCard } from 'web/components/contract/contract-card'
import { DateTimeTooltip } from 'web/components/datetime-tooltip'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { listContractsByGroupSlug } from 'web/lib/firebase/contracts'
import { getGroup, groupPath } from 'web/lib/firebase/groups'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
const toDate = (d: string) => dayjs(d, 'MMM D, YYYY').tz('America/Los_Angeles')

type Tourney = {
  title: string
  url?: string
  blurb: string // actual description in the click-through
  award?: string
  endTime?: Dayjs
  groupId: string
}

const Salem = {
  title: 'CSPI/Salem Forecasting Tournament',
  blurb: 'Top 5 traders qualify for a UT Austin research fellowship.',
  url: 'https://salemcenter.manifold.markets/',
  award: '$25,000',
  endTime: toDate('Jul 31, 2023'),
} as const

const tourneys: Tourney[] = [
  {
    title: 'Cause Exploration Prizes',
    blurb:
      'Which new charity ideas will Open Philanthropy find most promising?',
    award: 'M$100k',
    endTime: toDate('Sep 9, 2022'),
    groupId: 'cMcpBQ2p452jEcJD2SFw',
  },
  {
    title: 'Fantasy Football Stock Exchange',
    blurb: 'How many points will each NFL player score this season?',
    award: '$2,500',
    endTime: toDate('Jan 6, 2023'),
    groupId: 'SxGRqXRpV3RAQKudbcNb',
  },
  // {
  //   title: 'Clearer Thinking Regrant Project',
  //   blurb: 'Something amazing',
  //   award: '$10,000',
  //   endTime: toDate('Sep 22, 2022'),
  //   groupId: '2VsVVFGhKtIdJnQRAXVb',
  // },
]

export async function getStaticProps() {
  const groupIds = tourneys
    .map((data) => data.groupId)
    .filter((id) => id != undefined) as string[]
  const groups = (await Promise.all(groupIds.map(getGroup)))
    // Then remove undefined groups
    .filter(Boolean) as Group[]

  const contracts = await Promise.all(
    groups.map((g) => listContractsByGroupSlug(g?.slug ?? ''))
  )

  const markets = Object.fromEntries(groups.map((g, i) => [g.id, contracts[i]]))

  const groupMap = keyBy(groups, 'id')
  const numPeople = mapValues(groupMap, (g) => g?.memberIds.length)
  const slugs = mapValues(groupMap, 'slug')

  return { props: { markets, numPeople, slugs }, revalidate: 60 * 10 }
}

export default function TournamentPage(props: {
  markets: { [groupId: string]: Contract[] }
  numPeople: { [groupId: string]: number }
  slugs: { [groupId: string]: string }
}) {
  const { markets = {}, numPeople = {}, slugs = {} } = props

  return (
    <Page>
      <SEO
        title="Tournaments"
        description="Win money by betting in forecasting touraments on current events, sports, science, and more"
      />
      <Col className="mx-4 mt-4 gap-20 sm:mx-10 xl:w-[125%]">
        {tourneys.map(({ groupId, ...data }) => (
          <Section
            key={groupId}
            {...data}
            url={groupPath(slugs[groupId])}
            ppl={numPeople[groupId] ?? 0}
            markets={markets[groupId] ?? []}
          />
        ))}
        <Section {...Salem} markets={[]} />
      </Col>
    </Page>
  )
}

function Section(props: {
  title: string
  url: string
  blurb: string
  award?: string
  ppl?: number
  endTime?: Dayjs
  markets: Contract[]
}) {
  const { title, url, blurb, award, ppl, endTime, markets } = props

  return (
    <div>
      <Link href={url}>
        <a className="group mb-3 flex flex-wrap justify-between">
          <h2 className="text-xl font-semibold group-hover:underline md:text-3xl">
            {title}
          </h2>
          <Row className="my-2 items-center gap-4 whitespace-nowrap rounded-full bg-gray-200 px-6">
            {!!award && <span className="flex items-center">🏆 {award}</span>}
            {!!ppl && (
              <span className="flex items-center gap-1">
                <UsersIcon className="h-4" />
                {ppl}
              </span>
            )}
            {endTime && (
              <DateTimeTooltip time={endTime} text="Ends">
                <span className="flex items-center gap-1">
                  <ClockIcon className="h-4" />
                  {endTime.format('MMM D')}
                </span>
              </DateTimeTooltip>
            )}
          </Row>
        </a>
      </Link>
      <span>{blurb}</span>
      <Carousel className="-mx-4 mt-2 sm:-mx-10">
        <div className="shrink-0 sm:w-6" />
        {markets.length ? (
          markets.map((m) => (
            <ContractCard
              contract={m}
              showHotVolume
              hideGroupLink
              className="max-h-[200px] w-96 shrink-0"
              questionClass="line-clamp-3"
            />
          ))
        ) : (
          <div className="flex h-32 w-80 items-center justify-center rounded bg-white text-lg text-gray-700 shadow-md">
            Coming Soon...
          </div>
        )}
      </Carousel>
    </div>
  )
}

function Carousel(props: { children: ReactNode; className?: string }) {
  const { children, className } = props

  const ref = useRef<HTMLDivElement>(null)

  const th = (f: () => any) => throttle(f, 500, { trailing: false })
  const scrollLeft = th(() =>
    ref.current?.scrollBy({ left: -ref.current.clientWidth })
  )
  const scrollRight = th(() =>
    ref.current?.scrollBy({ left: ref.current.clientWidth })
  )

  const [atFront, setAtFront] = useState(true)
  const [atBack, setAtBack] = useState(false)
  const onScroll = throttle(() => {
    if (ref.current) {
      const { scrollLeft, clientWidth, scrollWidth } = ref.current
      setAtFront(scrollLeft < 80)
      setAtBack(scrollWidth - (clientWidth + scrollLeft) < 80)
    }
  }, 500)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(onScroll, [])

  return (
    <div className={clsx('relative', className)}>
      <Row
        className="scrollbar-hide w-full gap-4 overflow-x-auto scroll-smooth"
        ref={ref}
        onScroll={onScroll}
      >
        {children}
      </Row>
      {!atFront && (
        <div
          className="absolute left-0 top-0 bottom-0 z-10 flex w-10 cursor-pointer items-center justify-center hover:bg-indigo-100/30"
          onMouseDown={scrollLeft}
        >
          <ChevronLeftIcon className="h-7 w-7 rounded-full bg-indigo-50 text-indigo-700" />
        </div>
      )}
      {!atBack && (
        <div
          className="absolute right-0 top-0 bottom-0 z-10 flex w-10 cursor-pointer items-center justify-center hover:bg-indigo-100/30"
          onMouseDown={scrollRight}
        >
          <ChevronRightIcon className="h-7 w-7 rounded-full bg-indigo-50 text-indigo-700" />
        </div>
      )}
    </div>
  )
}
