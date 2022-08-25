import { ClockIcon } from '@heroicons/react/outline'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  UsersIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { formatLargeNumber } from 'common/util/format'
import dayjs, { Dayjs } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { throttle } from 'lodash'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { ContractCard } from 'web/components/contract/contract-card'
import { DateTimeTooltip } from 'web/components/datetime-tooltip'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { useContracts } from 'web/hooks/use-contracts'
import { useGroup } from 'web/hooks/use-group'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
const toDate = (d: string) => dayjs(d, 'MMM D, YYYY').tz('America/Los_Angeles')

type Tourney = {
  title: string
  url?: string
  blurb: string // actual description in the click-through
  award?: number
  endTime?: Dayjs
  // TODO: somehow get the markets
  groupId?: string
}

const tourneys: Tourney[] = [
  {
    title: 'CSPI/Salem Tournament',
    blurb:
      'Forecasting contest - top 5 can become Salem Center’s next research fellow.',
    url: 'https://salemcenter.manifold.markets/',
    award: 25_000,
  },
  {
    title: 'Fantasy Football Stock Exchange',
    blurb: 'How many points will each NFL player score?',
    url: 'https://manifold.markets/group/fantasy-football-stock-exchange',
    award: 500,
    endTime: toDate('Jan 6, 2023'),
    groupId: 'SxGRqXRpV3RAQKudbcNb',
  },
  {
    title: 'Cause Exploration Prize',
    blurb:
      'Which new charity ideas will Open Philanthropy find most promising?',
    award: 100_000,
    endTime: toDate('Sep 9, 2022'),
  },
  {
    title: 'Clearer Thinking Regrant Project',
    blurb: 'Something amazing',
    award: 1_000_000,
    endTime: toDate('Sep 22, 2022'),
  },
]

export default function TournamentPage() {
  const ffsx = useGroup('SxGRqXRpV3RAQKudbcNb')
  const markets = useContracts() ?? []
  const ffsxMarkets = markets
    .filter((m) => (ffsx?.contractIds ?? []).includes(m.id))
    .slice(0, 50)

  const ffsxLength = ffsx?.memberIds.length

  useEffect(() => console.log(tourneys), [])

  return (
    <Page>
      <SEO
        title="Tournaments"
        description="Win money by betting in forecasting touraments on current events, sports, science, and more"
      />
      <Col className="mx-4 sm:mx-10 xl:w-[125%]">
        <h1 className="my-4 text-2xl text-indigo-700">Tournaments</h1>
        {tourneys.map(({ groupId, ...data }) => (
          <Section {...data} markets={groupId ? ffsxMarkets : []} />
        ))}
      </Col>
    </Page>
  )
}

function Section(props: {
  title: string
  url?: string
  blurb: string
  award?: number
  endTime?: Dayjs
  markets: Contract[]
}) {
  const { title, url, blurb, award, endTime, markets } = props

  return (
    <div className="my-4">
      <Row className="mb-3 flex-wrap justify-between">
        <h2 className="text-xl font-semibold hover:underline">
          {url ? <a href={url}>{title}</a> : title}
        </h2>
        <Row className="items-center gap-4 whitespace-nowrap rounded-full bg-gray-200 px-6">
          {!!award && (
            <span className="flex items-center">
              🏆 ${formatLargeNumber(award)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <UsersIcon className="h-4" />
            400
          </span>
          {endTime && (
            <DateTimeTooltip time={endTime} text="Ends">
              <span className="flex items-center gap-1">
                <ClockIcon className="h-4" />
                {endTime.format('MMM D')}
              </span>
            </DateTimeTooltip>
          )}
        </Row>
      </Row>
      <span>{blurb}</span>
      <Carousel className="-mx-4 mt-2 sm:-mx-10">
        <div className="shrink-0 sm:w-6" />
        {markets.length ? (
          markets.map((m) => (
            <ContractCard
              contract={m}
              showHotVolume
              hideGroupLink
              className="shrink-0"
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
