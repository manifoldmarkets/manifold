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
import { forwardRef, useState } from 'react'
import { sleep } from 'common/util/time'
import { contractPath } from 'common/contract'
import { Avatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { OutcomeLabel } from 'web/components/outcome-label'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function LootBoxPage() {
  useTracking('view loot box')

  const [box, setBox] = usePersistentInMemoryState<LootBox | undefined>(
    undefined,
    'lootbox'
  )

  const [disabed, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const buyLootBox = async () => {
    setDisabled(true)
    setError(false)
    setLoading(true)

    const { box } = await callApi('lootbox')
    setLoading(false)

    if (!box) {
      setError(true)
      setDisabled(false)
      return
    }

    setBox(box)

    await sleep(10000)
    setDisabled(false)
  }

  return (
    <Page className="">
      <Col className=" items-center">
        <Col className="bg-canvas-0 h-full max-w-xl rounded p-4 py-8 sm:p-8 sm:shadow-md">
          <Title>Loot box</Title>
          <img
            className="mb-6 block -scale-x-100 self-center"
            src="/logo-flapping-with-money.gif"
            width={200}
            height={200}
          />

          <div className={'mb-4'}>
            Feeling lucky? A loot box gives you random shares in markets worth
            up to {formatMoney(LOOTBOX_MAX)}!
          </div>

          <Button
            size="2xl"
            color="gradient-pink"
            onClick={buyLootBox}
            disabled={disabed}
          >
            Buy loot box for {formatMoney(LOOTBOX_COST)}
          </Button>

          {error && (
            <div className={'text-red-700'}>
              Something went wrong, please try again later.
            </div>
          )}

          {loading && <LoadingIndicator className="mt-4" size="lg" />}

          {box && (
            <>
              <div className={'my-8 text-xl text-indigo-700'}>Your loot</div>
              <Col className="bg-canvas-0 divide-ink-400 border-ink-400 w-full divide-y-[0.5px] rounded-sm border-[0.5px]">
                <Row className="group flex flex-col justify-end gap-1 whitespace-nowrap px-4 py-3 lg:flex-row lg:gap-2">
                  <div className="min-w-[2rem] text-right">Shares</div>
                  <div className={clsx('min-w-[2rem] text-right')}>Value</div>
                </Row>
                {box.map((loot) => (
                  <LootRow key={loot.contract.id} loot={loot} />
                ))}
              </Col>
            </>
          )}
        </Col>
      </Col>
    </Page>
  )
}

const LootRow = forwardRef(
  (
    props: {
      loot: LootBoxItem
      className?: string
    },
    ref: React.Ref<HTMLAnchorElement>
  ) => {
    const { className, loot } = props
    const { contract, amount, shares, outcome } = loot

    const { creatorUsername, creatorAvatarUrl, question } = contract

    return (
      <Link
        ref={ref}
        href={contractPath(contract)}
        className={clsx(
          'group flex flex-col gap-1 whitespace-nowrap px-4 py-3 lg:flex-row lg:gap-2',
          'focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors',
          className
        )}
      >
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
        <Row className="gap-3">
          <Avatar
            className="lg:hidden"
            username={creatorUsername}
            avatarUrl={creatorAvatarUrl}
            size="xs"
          />
          <div className="min-w-[2rem] text-right">
            {Math.floor(shares)}{' '}
            <OutcomeLabel
              contract={contract}
              outcome={outcome}
              truncate={'short'}
            />{' '}
          </div>
          <div className={clsx('min-w-[2rem] text-right')}>
            {formatMoney(amount)}
          </div>
        </Row>
      </Link>
    )
  }
)
