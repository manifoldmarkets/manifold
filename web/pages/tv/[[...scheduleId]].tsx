import clsx from 'clsx'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Router from 'next/router'
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
import { deleteTV, setTV } from 'web/lib/firebase/api'
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
import { removeUndefinedProps } from 'common/util/object'
import ShortToggle from 'web/components/widgets/short-toggle'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

const filterSchedule = (
  schedule: ScheduleItem[] | null,
  scheduleId: string | null
) => {
  return (schedule ?? []).filter(
    (s) =>
      dayjs(s.end_time ?? '').isAfter(dayjs()) || s.id.toString() === scheduleId
  )
}

export async function getStaticProps(props: {
  params: { scheduleId: string[] }
}) {
  const scheduleId = props.params.scheduleId?.[0] ?? null

  const { data } = await db.from('tv_schedule').select('*')
  const schedule = filterSchedule(data as ScheduleItem[] | null, scheduleId)

  const contractIds = schedule.map((s) => s.contract_id)
  const contracts = await getContracts(contractIds)

  return {
    props: {
      contracts,
      schedule,
      scheduleId,
    },
  }
}

export default function TVPage(props: {
  schedule: ScheduleItem[]
  contracts: Contract[]
  scheduleId: string | null
}) {
  const [schedule, setSchedule] = useState(props.schedule)

  const contractsList = props.contracts.concat(
    useContracts(
      schedule.map((s) => s.contract_id),
      undefined
    )
  )
  const contracts = mapKeys(contractsList, 'id')

  const tvSchedule = useSubscription('tv_schedule')

  useEffect(() => {
    if (!tvSchedule.rows || !tvSchedule.rows.length) return

    const newSchedule = filterSchedule(tvSchedule.rows as any, props.scheduleId)
    setSchedule(newSchedule)
  }, [tvSchedule.rows])

  const stream = getActiveStream(schedule, props.scheduleId)
  const contract = contracts[stream?.contract_id ?? '']

  const user = useUser()
  const isAdmin = useAdmin()

  const isMobile = useIsMobile(1280) //xl
  const [showSettings, setShowSettings] = useState<false | 'edit' | 'new'>(
    false
  )

  const [featured, userCreated] = partition(schedule, (s) => s.is_featured)

  if (!contract && props.scheduleId && props.scheduleId !== 'schedule') {
    return (
      <Page trackPageView="tv page">
        <SEO
          title="Manifold TV"
          description="Bet on live video streams with Manifold TV"
        />
        <Title>Manifold TV</Title>
        <div className="italic">Cannot find scheduled event</div>
      </Page>
    )
  }
  if (!contract || props.scheduleId === 'schedule')
    return (
      <Page trackPageView="tv page">
        <SEO
          title="Manifold TV"
          description="Bet on live video streams with Manifold TV"
        />
        <Title>Manifold TV</Title>

        <div>Bet on your favorite streams!</div>

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
          <Button color="indigo-outline" onClick={() => setShowSettings('new')}>
            Schedule event
          </Button>
          <ScheduleTVModal
            open={!!showSettings}
            setOpen={() => setShowSettings(false)}
          />
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

  const channelId = `tv-${stream?.id ?? 'default'}`

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
                      <PublicChat
                        channelId={channelId}
                        key={channelId}
                        className="bg-canvas-50"
                      />
                    ),
                  },
                ]}
              />
            ) : (
              betPanel
            )}
          </Col>

          <Row className="m-4 gap-4">
            {(user?.id === stream?.creator_id || isAdmin) && (
              <Button
                color="indigo-outline"
                onClick={() => setShowSettings('edit')}
              >
                Modify event
              </Button>
            )}
            <Button
              color="indigo-outline"
              onClick={() => Router.push('/tv/schedule')}
            >
              See schedule
            </Button>
            <ScheduleTVModal
              open={!!showSettings}
              setOpen={() => setShowSettings(false)}
              stream={showSettings === 'edit' ? stream : undefined}
              slug={showSettings === 'edit' ? contract.slug : undefined}
              key={showSettings || 0}
            />
          </Row>
        </Col>

        <Col className="ml-4 hidden min-h-full w-[300px] max-w-[375px] xl:flex xl:w-[350px]">
          <Col className={'sticky top-0'}>
            <Row className={'border-b-2 py-2 text-xl text-indigo-700'}>
              Live chat
            </Row>
            <PublicChat channelId={channelId} key={channelId} />
          </Col>
        </Col>
      </Row>
    </Page>
  )
}

interface ScheduleItem {
  id: number
  creator_id: string
  source: string
  title: string
  stream_id: string
  contract_id: string
  start_time: string
  end_time: string
  is_featured: boolean
}

const getActiveStream = (
  schedule: ScheduleItem[],
  scheduleId: string | null
) => {
  if (scheduleId) return schedule.find((s) => s.id.toString() === scheduleId)

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

function ScheduleRow(props: { stream: ScheduleItem; contract: Contract }) {
  const { stream, contract } = props
  return (
    <Link
      href={`/tv/${stream.id}`}
      key={stream.id}
      className="flex items-center gap-2 hover:underline"
    >
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
    </Link>
  )
}

const formatTimeRange = (start: string, end: string) => {
  const s = dayjs(start)
  const e = dayjs(end)

  const endDate = e.isSame(s, 'day') ? '' : `${e.format('M/D')} `

  return `${s.format('M/D H:mm')} - ${endDate}${e.format('H:mm')}`
}

export function ScheduleTVModal(props: {
  open: boolean
  setOpen(open: boolean): void
  stream?: ScheduleItem
  slug?: string
}) {
  const { open, setOpen, stream } = props

  const [streamId, setStreamId] = useState(stream?.stream_id ?? '')
  const [slug, setSlug] = useState(props.slug ?? '')
  const [title, setTitle] = useState(stream?.title ?? '')
  const [isFeatured, setIsFeatured] = useState(stream?.is_featured ?? false)

  const defaultStart = stream
    ? dayjs(stream.start_time).format('YYYY-MM-DD HH:mm')
    : dayjs().format('YYYY-MM-DD HH:mm')
  const [startTime, setStartTime] = useState(defaultStart)

  const defaultEnd = stream
    ? dayjs(stream.end_time).format('YYYY-MM-DD HH:mm')
    : ''
  const [endTime, setEndTime] = useState(defaultEnd)

  const [error, setError] = useState('')

  const save = async () => {
    if (!streamId || !slug || !title || !startTime || !endTime) {
      setError('Please fill in all the required fields')
      return
    }

    // Validate the YouTube Stream ID
    if (streamId.length !== 11) {
      setError(
        'Invalid YouTube Stream ID. It should be exactly 11 characters long.'
      )
      return
    }

    const start = dayjs(startTime)
    const end = dayjs(endTime)

    if (!start.isValid() || !end.isValid()) {
      setError('Invalid start or end time format.')
      return
    }

    if (end.isBefore(start)) {
      setError('End time should be after the start time.')
      return
    }

    setOpen(false)

    await setTV(
      removeUndefinedProps({
        id: stream?.id.toString(),
        streamId: streamId,
        slug: slug,
        title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        source: 'youtube',
        isFeatured,
      })
    )

    if (!stream) {
      Router.push(`/tv/schedule`)
    }
  }

  const deleteStream = async () => {
    if (stream) {
      setOpen(false)
      await deleteTV(stream.id.toString())
    }
  }

  const isAdmin = useAdmin()
  const user = useUser()
  const isCreatorOrAdmin = stream?.creator_id === user?.id || isAdmin

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 text-ink-1000 rounded-md p-8"
      size="sm"
    >
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">
          {stream ? 'Modify' : 'Schedule'} TV event
        </Title>

        <Row className="items-center justify-between">
          <div>Event name</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Row>

        <Row className="items-center justify-between">
          <div>YouTube Stream ID</div>
          <Input
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            maxLength={11}
          />
        </Row>

        <Row className="items-center justify-between">
          <div>Market slug</div>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Row>

        <Row className="items-center justify-between gap-2">
          <div>Start</div>
          <Input
            type={'datetime-local'}
            className="dark:date-range-input-white"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStartTime(e.target.value)}
            value={startTime}
            step={undefined}
          />
        </Row>

        <Row className="items-center justify-between">
          <div>End</div>
          <Input
            type={'datetime-local'}
            className="dark:date-range-input-white"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEndTime(e.target.value)}
            value={endTime}
            step={undefined}
          />
        </Row>

        {isAdmin && (
          <Row className="items-center justify-between">
            <div>Featured</div>
            <ShortToggle on={isFeatured} setOn={(on) => setIsFeatured(on)} />
          </Row>
        )}

        {error && (
          <Row className="text-error mt-4">
            <div>{error}</div>
          </Row>
        )}

        <Row className="gap-4">
          <Button color="indigo" size="xl" onClick={save}>
            {stream ? 'Save' : 'Schedule'}
          </Button>
          {stream && isCreatorOrAdmin && (
            <Button size="xs" color="red-outline" onClick={deleteStream}>
              Delete event
            </Button>
          )}
        </Row>
      </Col>
    </Modal>
  )
}
