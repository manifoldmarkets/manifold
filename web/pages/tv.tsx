import clsx from 'clsx'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { mapKeys, partition } from 'lodash'

import { Contract, tradingAllowed } from 'common/contract'
import { SEO } from 'web/components/SEO'
import { SignedInBinaryMobileBetting } from 'web/components/bet/bet-button'
import { Button } from 'web/components/buttons/button'
import { BinaryResolutionOrChance } from 'web/components/contract/contract-price'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { useUser } from 'web/hooks/use-user'
import { setTV } from 'web/lib/firebase/api'
import { getContracts } from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { Linkify } from 'web/components/widgets/linkify'
import { useAdmin } from 'web/hooks/use-admin'
import { SimpleMultiOverview } from 'web/components/contract/contract-overview'
import { PublicChat } from 'web/components/chat/public-chat'
import { Tabs } from 'web/components/layout/tabs'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Avatar } from 'web/components/widgets/avatar'

export async function getStaticProps() {
  const { data } = await db.from('tv_schedule').select('*')

  const schedule = (data ?? []).filter(
    (s) => +new Date(s.end_time ?? 0) > Date.now()
  )

  const contractIds = schedule.map((s) => s.contract_id)
  const contracts = await getContracts(contractIds)

  return {
    props: {
      contracts,
      schedule,
    },
  }
}

function ScheduleRow(props: { stream: ScheduleItem; contract: Contract }) {
  const { stream, contract } = props
  return (
    <Row key={stream.id} className="items-center gap-2">
      <Col>
        <Avatar
          size="2xs"
          avatarUrl={contract?.creatorAvatarUrl}
          username={contract?.creatorUsername}
          noLink
        />
      </Col>
      <Col className="font-semibold">{stream.title}</Col>
      <Col>{formatTimeRange(stream.start_time, stream.end_time)}</Col>
    </Row>
  )
}

export default function TVPage(props: {
  schedule: ScheduleItem[]
  contracts: Contract[]
}) {
  const [schedule, setSchedule] = useState(props.schedule)

  const contractsList =
    useContracts(
      schedule.map((s) => s.contract_id),
      undefined
    ) ?? props.contracts
  const contracts = mapKeys(contractsList, 'id')

  const tvSchedule = useSubscription('tv_schedule')

  useEffect(() => {
    if (!tvSchedule.rows || !tvSchedule.rows.length) return
    setSchedule(tvSchedule.rows as any as ScheduleItem[])
  }, [tvSchedule])

  const stream = getActiveStream(schedule)
  const contract = contracts[stream?.contract_id ?? '']

  const user = useUser()
  const isAdmin = useAdmin()

  const isMobile = useIsMobile(1280) //xl
  const [showSettings, setShowSettings] = useState(false)

  const [featured, userCreated] = partition(schedule, (s) => s.is_featured)

  if (!contract)
    return (
      <Page trackPageView="tv page">
        <SEO
          title="Manifold TV"
          description="Bet on live video streams with Manifold TV"
        />
        <Title>Manifold TV</Title>

        {featured.length > 0 && (
          <>
            <Subtitle>Featured events</Subtitle>
            {featured
              .map((s) => [s, contracts[s.contract_id]] as const)
              .map(([s, c]) => (
                <ScheduleRow key={s.id} stream={s} contract={c} />
              ))}
          </>
        )}

        <Subtitle>User-created events</Subtitle>
        {userCreated
          .map((s) => [s, contracts[s.contract_id]] as const)
          .map(([s, c]) => (
            <ScheduleRow key={s.id} stream={s} contract={c} />
          ))}
        {userCreated.length === 0 && (
          <div className="italic">No events scheduled</div>
        )}

        <Row className="mt-2">
          <Button color="indigo-outline" onClick={() => setShowSettings(true)}>
            Schedule event
          </Button>
          <TVSettingsModal open={showSettings} setOpen={setShowSettings} />
        </Row>
      </Page>
    )

  const isBinary = contract.outcomeType === 'BINARY'
  const isMulti =
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'

  const betPanel = (
    <>
      {tradingAllowed(contract) && isBinary && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
      {tradingAllowed(contract) && isMulti && (
        <SimpleMultiOverview contract={contract} />
      )}
    </>
  )

  const channelId = `tv-${stream?.stream_id ?? 'default'}`

  return (
    <Page trackPageView="tv page" className="!mt-0 xl:col-span-10 xl:pr-0">
      <SEO
        title="Manifold TV"
        description="Bet on live video streams with Manifold TV"
      />
      <Row className="w-full items-start">
        <Col className={clsx('bg-canvas-0 w-full rounded-b ')}>
          <iframe
            src={
              'https://www.youtube.com/embed/' +
              stream?.stream_id +
              '?autoplay=1'
            }
            title="Manifold Live video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="bg-canvas-0 h-[300px] w-full lg:h-[500px]"
          ></iframe>

          <Col className="mb-2 p-4 md:pb-8 lg:px-8">
            <Row className="justify-between gap-4">
              <Row className="gap-2 text-xl font-medium sm:text-2xl">
                <Link
                  href={`/${contract.creatorUsername}/${contract.slug}`}
                  target="_blank"
                  className="hover:underline"
                >
                  <Linkify text={contract.question} />
                </Link>
              </Row>
              {isBinary && (
                <BinaryResolutionOrChance isCol contract={contract} />
              )}
            </Row>
            {isMobile ? (
              <Tabs
                tabs={[
                  { title: 'Market', content: betPanel },
                  {
                    title: 'Chat',
                    content: (
                      <PublicChat channelId={channelId} className="bg-canvas-50" />
                    ),
                  },
                ]}
              />
            ) : (
              betPanel
            )}
          </Col>

          {isAdmin && (
            <Row className="m-4">
              <Button
                color="indigo-outline"
                onClick={() => setShowSettings(true)}
              >
                Set Stream
              </Button>
              <TVSettingsModal open={showSettings} setOpen={setShowSettings} />
            </Row>
          )}
        </Col>

        <Col className="ml-4 hidden min-h-full w-[300px] max-w-[375px] xl:flex xl:w-[350px]">
          <Col className={'sticky top-0'}>
            <Row className={'border-b-2 py-2 text-xl text-indigo-700'}>
              Live chat
            </Row>
            <PublicChat channelId={channelId} />
          </Col>
        </Col>
      </Row>
    </Page>
  )
}

interface ScheduleItem {
  id: number
  source: string
  title: string
  stream_id: string
  contract_id: string
  start_time: string
  end_time: string
  is_featured: string
}

const getActiveStream = (schedule: ScheduleItem[]) => {
  const featured = schedule.filter((s) => s.is_featured)

  const now = new Date().toISOString()
  const activeNow = featured.find((s) => s.start_time < now && s.end_time > now)
  if (activeNow) return activeNow

  const soonest = featured
    .concat()
    .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))
  if (
    soonest.length > 0 &&
    Date.now() - +new Date(soonest[0].start_time) < 3600
  )
    return soonest[0]

  const justEnded = featured
    .concat()
    .sort((a, b) => +new Date(a.end_time) - +new Date(b.end_time))
  if (soonest.length > 0 && Date.now() - +new Date(soonest[0].end_time) < 3600)
    return justEnded[0]

  return undefined
}

const formatTimeRange = (start: string, end: string) => {
  const s = new Date(start)
  const e = new Date(end)

  const endDate =
    e.getDate() === s.getDate() ? '' : `${e.getMonth()}/${e.getDate()} `

  return `${s.getMonth()}/${s.getDate()} ${s.getHours()}:${s.getMinutes()} - ${endDate}${e.getHours()}:${s.getMinutes()}`
}

export function TVSettingsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props

  const [streamId, setStreamId] = useState('')
  const [slug, setSlug] = useState('')

  const save = async () => {
    if (!streamId || !slug) return

    await setTV({ streamId: streamId, slug: slug, source: 'youtube' })
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 text-ink-1000 rounded-md p-8"
      size="sm"
    >
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">TV settings</Title>

        <Row className="items-center justify-between">
          <div>YouTube Stream ID</div>
          <Input
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
          />
        </Row>
        <Row className="items-center justify-between">
          <div>Market slug</div>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Row>

        <Row className="gap-4">
          <Button color="indigo" size="xl" onClick={save}>
            Save
          </Button>
          <Button color="gray-outline" size="lg" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
