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

export function TradesButton(props: { contract: Contract }) {
  const { contract } = props
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [uniqueTraders, setUniqueTraders] = useState(contract.uniqueBettorCount)

  useEffect(() => {
    setUniqueTraders(contract.uniqueBettorCount)
  }, [contract.uniqueBettorCount])

  return (
    <>
      <Tooltip
        text={'Unique Traders'}
        placement={'bottom'}
        className={clsx('flex flex-row items-center')}
      >
        <button
          disabled={uniqueTraders === 0}
          className={clsx(
            'text-ink-500 pr-2 transition-transform disabled:cursor-not-allowed'
          )}
          onClick={(e) => {
            e.preventDefault()
            setModalOpen(true)
          }}
        >
          <Row className="relative justify-center gap-1.5 p-1 text-sm">
            <UserIcon className={clsx('h-5 w-5')} />
            <div>{uniqueTraders > 0 ? uniqueTraders : ''}</div>
          </Row>
          <Modal
            open={modalOpen}
            setOpen={setModalOpen}
            className={clsx(MODAL_CLASS)}
          >
            <div className={'bg-canvas-0 sticky top-0 py-2'}>
              Bets on <span className="font-bold">{contract.question}</span>
            </div>
            <div className={SCROLLABLE_MODAL_CLASS}>
              <BetsModalContent contract={contract} />
            </div>
          </Modal>
        </button>
      </Tooltip>
    </>
  )
}

function BetsModalContent(props: { contract: Contract }) {
  const { contract } = props
  const bets = useBets({ contractId: contract.id })
  if (bets === undefined) return <LoadingIndicator />
  else if (bets.length === 0) return <div>No bets yet</div>
  return <BetsTabContent contract={contract} bets={bets} scrollToTop={false} />
}
