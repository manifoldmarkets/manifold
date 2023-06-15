import { UserIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import { useBets } from 'web/hooks/use-bets-supabase'
import { MODAL_CLASS, Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { BetsTabContent } from './contract-tabs'
import { shortFormatNumber } from 'common/util/format'
import { ENV_CONFIG } from 'common/envs/constants'

export function TradesButton(props: {
  contract: Contract
  showChange?: boolean
}) {
  const { contract, showChange } = props
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [uniqueTraders, setUniqueTraders] = useState(contract.uniqueBettorCount)
  const vol = contract.volume24Hours
  useEffect(() => {
    setUniqueTraders(contract.uniqueBettorCount)
  }, [contract.uniqueBettorCount])

  return (
    <button
      disabled={uniqueTraders === 0}
      className={clsx(
        'text-ink-500 py-1 pr-2 pl-2 transition-transform disabled:cursor-not-allowed'
      )}
      onClick={(e) => {
        e.preventDefault()
        setModalOpen(true)
      }}
    >
      <Row className="relative justify-center gap-1.5 text-sm">
        <Tooltip
          text={'Traders'}
          placement={'bottom'}
          className={clsx('flex flex-row items-center justify-center gap-1.5')}
        >
          <UserIcon className={clsx(' h-5')} />
          <div>{uniqueTraders > 0 ? uniqueTraders : ''}</div>
        </Tooltip>
        {showChange && (
          <Tooltip text={'24hr Volume'} placement={'bottom'}>
            <span className={'text-teal-500'}>
              +{ENV_CONFIG.moneyMoniker + shortFormatNumber(vol)}
            </span>
          </Tooltip>
        )}
      </Row>
      <Modal
        open={modalOpen}
        setOpen={setModalOpen}
        className={clsx(MODAL_CLASS)}
        size={'lg'}
      >
        <div className={'bg-canvas-0 sticky top-0 py-2'}>
          Bets on <span className="font-bold">{contract.question}</span>
        </div>
        <div className={SCROLLABLE_MODAL_CLASS}>
          <BetsModalContent contract={contract} />
        </div>
      </Modal>
    </button>
  )
}

function BetsModalContent(props: { contract: Contract }) {
  const { contract } = props
  const bets = useBets({ contractId: contract.id })
  if (bets === undefined) return <LoadingIndicator />
  else if (bets.length === 0) return <div>No bets yet</div>
  return <BetsTabContent contract={contract} bets={bets} scrollToTop={false} />
}
