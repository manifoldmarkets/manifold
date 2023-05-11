import { forwardRef, useRef, useState } from 'react'
import Lottie from 'react-lottie'
import * as lootbox from '../public/lottie/lootbox.json'
import Link from 'next/link'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import {
  LOOTBOX_COST,
  LOOTBOX_MAX,
  LootBox,
  LootBoxItem,
} from 'common/loot-box'
import { callApi } from 'web/lib/firebase/api'
import { sleep } from 'common/util/time'
import { contractPath } from 'common/contract'
import { Avatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { OutcomeLabel } from 'web/components/outcome-label'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { track } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'
import { SEO } from 'web/components/SEO'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function LootBoxPage() {
  useTracking('view loot box')
  const user = useUser()
  const cantAfford = (user?.balance ?? 0) < LOOTBOX_COST

  const [box, setBox] = usePersistentInMemoryState<LootBox | undefined>(
    undefined,
    'lootbox'
  )

  const [disabed, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [animationPaused, setAnimationPaused] = useState(true)
  const [openLootModal, setOpenLootModal] = useState(false)
  const animationRef = useRef<any>(null)

  const buyLootBox = async () => {
    setDisabled(true)
    setError(false)
    setLoading(true)

    const { box } = await callApi('lootbox').catch((e) => {
      console.error('Loot error', e)
      return { box: undefined }
    })
    setLoading(false)

    if (!box) {
      setError(true)
      setDisabled(false)
      return
    }

    setAnimationPaused(false)
    setBox(box)
    setTimeout(() => {
      setAnimationPaused(true)
      setOpenLootModal(true)
    }, 1200)
    track('buy loot box')

    await sleep(5000)
    setDisabled(false)
    animationRef?.current?.anim.goToAndStop(0, true)
  }

  return (
    <Page>
      <SEO
        title="Loot box"
        description={`Feeling lucky? A loot box gives you random shares in markets worth
            up to ${formatMoney(LOOTBOX_MAX)}!`}
      />
      <Col className=" items-center">
        <Col className="bg-canvas-0 h-full max-w-xl rounded p-4 py-8 sm:p-8 sm:shadow-md">
          <Title>Loot box</Title>
          <Lottie
            ref={animationRef}
            options={{
              loop: false,
              autoplay: false,
              animationData: lootbox,
              rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
              },
            }}
            height={200}
            width={200}
            isStopped={false}
            isPaused={animationPaused}
            style={{
              color: '#6366f1',
              pointerEvents: 'none',
              background: 'transparent',
            }}
          />

          <div className={'mb-4'}>
            Feeling lucky? A loot box gives you random shares in markets worth
            up to {formatMoney(LOOTBOX_MAX)}!
          </div>

          <Button
            size="2xl"
            color="gradient-pink"
            onClick={buyLootBox}
            disabled={disabed || cantAfford}
            loading={loading}
          >
            Buy loot box for {formatMoney(LOOTBOX_COST)}
          </Button>

          {error && (
            <div className={'text-red-700'}>
              Something went wrong, please try again later.
            </div>
          )}

          <LootModal
            open={openLootModal}
            setOpen={setOpenLootModal}
            box={box}
          />
        </Col>
      </Col>
    </Page>
  )
}

function LootModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  box?: LootBox
}) {
  const { open, setOpen, box } = props
  const totalValue = box?.reduce((acc, loot) => acc + loot.amount, 0)
  return (
    <>
      {open && (
        <FullscreenConfetti
          recycle={false}
          numberOfPieces={300}
          className="hidden md:flex"
        />
      )}

      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          {box && (
            <>
              <Title>Your loot</Title>
              <Col className="w-full items-center justify-center text-2xl text-teal-700">
                {formatMoney(totalValue ?? 0)}
                <div className="text-ink-1000 text-sm"> total value</div>
              </Col>
              <table className="mt-4 w-full overflow-y-auto">
                <thead
                  className={clsx(
                    'text-ink-600 bg-canvas-50 sticky top-0 z-20 text-left text-sm font-semibold'
                  )}
                >
                  <tr>
                    <th className="px-4" key={'market'}>
                      Market
                    </th>
                    <th className="pr-4" key={'market'}>
                      Shares
                    </th>
                    <th className="px-4" key={'market'}>
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {box.map((loot) => (
                    <LootRow key={loot.contract.id} loot={loot} />
                  ))}
                </tbody>
              </table>
            </>
          )}
          {!box && <>Something went wrong! We couldn't find your loot :(</>}
        </Col>
      </Modal>
    </>
  )
}

const LootRow = forwardRef(
  (props: { loot: LootBoxItem }, ref: React.Ref<HTMLAnchorElement>) => {
    const { loot } = props
    const { contract, amount, shares, outcome } = loot

    const { creatorUsername, creatorAvatarUrl, question } = contract

    return (
      <tr className=" hover:bg-indigo-400/20">
        <Link ref={ref} href={contractPath(contract)} className="contents">
          <td className="rounded-l px-4 py-2">
            <Row>
              <Avatar
                className="hidden lg:mr-1 lg:flex"
                username={creatorUsername}
                avatarUrl={creatorAvatarUrl}
                size="xs"
              />
              <div
                className={clsx(
                  'break-anywhere mr-0.5 whitespace-normal font-medium lg:mr-auto'
                )}
              >
                {question}
              </div>
            </Row>
          </td>
          <td className="pr-4">
            <div className="min-w-[4rem]">
              {Math.floor(shares)}{' '}
              <OutcomeLabel
                contract={contract}
                outcome={outcome}
                truncate={'short'}
              />{' '}
            </div>
          </td>
          <td className="rounded-r pr-4">
            <div className={clsx('min-w-[2rem] text-right')}>
              {formatMoney(amount)}
            </div>
          </td>
        </Link>
      </tr>
    )
  }
)
