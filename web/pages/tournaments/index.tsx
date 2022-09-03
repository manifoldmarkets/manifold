import { ClockIcon } from '@heroicons/react/outline'
import { UsersIcon } from '@heroicons/react/solid'
import {
  BinaryContract,
  Contract,
  PseudoNumericContract,
} from 'common/contract'
import { Group } from 'common/group'
import dayjs, { Dayjs } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { keyBy, mapValues, sortBy } from 'lodash'
import Image, { ImageProps, StaticImageData } from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { ContractCard } from 'web/components/contract/contract-card'
import { DateTimeTooltip } from 'web/components/datetime-tooltip'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { listContractsByGroupSlug } from 'web/lib/firebase/contracts'
import { getGroup, groupPath } from 'web/lib/firebase/groups'
import elon_pic from './_cspi/Will_Elon_Buy_Twitter.png'
import china_pic from './_cspi/Chinese_Military_Action_against_Taiwan.png'
import mpox_pic from './_cspi/Monkeypox_Cases.png'
import race_pic from './_cspi/Supreme_Court_Ban_Race_in_College_Admissions.png'
import { SiteLink } from 'web/components/site-link'
import { getProbability } from 'common/calculate'
import { Carousel } from 'web/components/carousel'

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
  markets: [],
  images: [
    {
      marketUrl:
        'https://salemcenter.manifold.markets/SalemCenter/will-elon-musk-buy-twitter',
      image: elon_pic,
    },
    {
      marketUrl:
        'https://salemcenter.manifold.markets/SalemCenter/chinese-military-action-against-tai',
      image: china_pic,
    },
    {
      marketUrl:
        'https://salemcenter.manifold.markets/SalemCenter/over-100000-monkeypox-cases-in-2022',
      image: mpox_pic,
    },
    {
      marketUrl:
        'https://salemcenter.manifold.markets/SalemCenter/supreme-court-ban-race-in-college-a',
      image: race_pic,
    },
  ],
}

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
  {
    title: 'SF 2022 Ballot',
    blurb: 'Which ballot initiatives will pass this year in SF and CA?',
    award: '',
    endTime: toDate('Nov 8, 2022'),
    groupId: 'VkWZyS5yxs8XWUJrX9eq',
  },
  // {
  //   title: 'Clearer Thinking Regrant Project',
  //   blurb: 'Something amazing',
  //   award: '$10,000',
  //   endTime: toDate('Sep 22, 2022'),
  //   groupId: '2VsVVFGhKtIdJnQRAXVb',
  // },
]

export function isTournament(groupId: string) {
  return tourneys.map((t) => t.groupId).includes(groupId)
}

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
  const numPeople = mapValues(groupMap, (g) => g?.totalMembers)
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
        <Section {...Salem} />
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
  images?: { marketUrl: string; image: StaticImageData }[] // hack for cspi
}) {
  const { title, url, blurb, award, ppl, endTime, images } = props
  // Sort markets by probability, highest % first
  const markets = sortBy(props.markets, (c) =>
    getProbability(c as BinaryContract | PseudoNumericContract)
  )
    .reverse()
    .filter((c) => !c.isResolved)

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
              <DateTimeTooltip time={endTime.valueOf()} text="Ends">
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
              hideGroupLink
              className="mb-2 max-h-[200px] w-96 shrink-0"
              questionClass="line-clamp-3"
              trackingPostfix=" tournament"
            />
          ))
        ) : (
          <>
            {images?.map(({ marketUrl, image }) => (
              <a href={marketUrl} className="hover:brightness-95">
                <NaturalImage src={image} />
              </a>
            ))}
            <SiteLink
              className="ml-6 mr-10 flex shrink-0 items-center text-indigo-700"
              href={url}
            >
              See more
            </SiteLink>
          </>
        )}
      </Carousel>
    </div>
  )
}

// stole: https://stackoverflow.com/questions/66845889/next-js-image-how-to-maintain-aspect-ratio-and-add-letterboxes-when-needed
const NaturalImage = (props: ImageProps) => {
  const [ratio, setRatio] = useState(4 / 1)

  return (
    <Image
      {...props}
      width={148 * ratio}
      height={148}
      layout="fixed"
      onLoadingComplete={({ naturalWidth, naturalHeight }) =>
        setRatio(naturalWidth / naturalHeight)
      }
    />
  )
}
