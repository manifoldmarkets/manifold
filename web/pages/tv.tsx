import clsx from 'clsx'
import { useEffect, useState } from 'react'
import Link from 'next/link'

import { Contract, tradingAllowed } from 'common/contract'
import { run } from 'common/supabase/utils'
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
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useUser } from 'web/hooks/use-user'
import { setTV } from 'web/lib/firebase/api'
import { getContract } from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { Linkify } from 'web/components/widgets/linkify'
import { useAdmin } from 'web/hooks/use-admin'
import { SimpleMultiOverview } from 'web/components/contract/contract-overview'
import { PublicChat } from 'web/components/chat/public-chat'
import { Tabs } from 'web/components/layout/tabs'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export async function getStaticProps() {
  const result = await run(db.from('tv_schedule').select('*').limit(1))

  const {
    source,
    stream_id: streamId,
    contract_id: contractId,
  } = result.data[0]

  const contract = await getContract(contractId)

  return {
    props: {
      source,
      streamId,
      contract,
    },
  }
}

export default function TVPage(props: {
  source: string
  streamId: string
  contract: Contract
}) {
  const [streamId, setStreamId] = useState(props.streamId)
  const [contractId, setContractId] = useState(props.contract.id)

  const tvSchedule = useSubscription('tv_schedule')

  useEffect(() => {
    if (!tvSchedule.rows) return
    const { stream_id, contract_id } = tvSchedule.rows[0]
    setStreamId(stream_id)
    setContractId(contract_id)
  }, [tvSchedule])

  const user = useUser()
  const isAdmin = useAdmin()

  const contract =
    useFirebasePublicContract('public', contractId) ?? props.contract

  const isBinary = contract.outcomeType === 'BINARY'
  const isMulti =
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'
  const [showSettings, setShowSettings] = useState(false)

  const isMobile = useIsMobile(1280) //xl

  if (!contract) return <div>Loading...</div>

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

  return (
    <Page trackPageView="tv page" className="!mt-0 xl:col-span-10 xl:pr-0">
      <SEO
        title="Manifold TV"
        description="Bet on live video streams with Manifold TV"
      />
      <Row className="w-full items-start">
        <Col className={clsx('bg-canvas-0 w-full rounded-b ')}>
          <iframe
            src={'https://www.youtube.com/embed/' + streamId + '?autoplay=1'}
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
                      <PublicChat channelId={'tv'} className="bg-canvas-50" />
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
            <PublicChat channelId={'tv'} />
          </Col>
        </Col>
      </Row>
    </Page>
  )
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
