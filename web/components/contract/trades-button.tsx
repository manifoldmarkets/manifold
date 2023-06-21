import { UserIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { useBets } from 'web/hooks/use-bets-supabase'
import { MODAL_CLASS, Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { BetsTabContent } from './contract-tabs'
import { BinaryUserPositionsTable } from 'web/components/contract/user-positions-table'
import { getCPMMContractUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Col } from 'web/components/layout/col'

export function TradesButton(props: { contract: Contract }) {
  const { contract } = props
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [uniqueTraders, setUniqueTraders] = useState(contract.uniqueBettorCount)
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
      </Row>
      <Modal
        open={modalOpen}
        setOpen={setModalOpen}
        className={clsx(MODAL_CLASS)}
        size={'lg'}
      >
        <div className={'bg-canvas-0 sticky top-0'}>
          <span className="font-bold">{contract.question}</span>
        </div>
        <div className={clsx(SCROLLABLE_MODAL_CLASS, 'scrollbar-hide')}>
          {/*In case we need it:*/}
          {/*<span className={'text-ink-500 text-xs'}>*/}
          {/*  Currently held positions may not equal total traders*/}
          {/*</span>*/}
          <BetsModalContent contract={contract} />
        </div>
      </Modal>
    </button>
  )
}

function BetsModalContent(props: { contract: Contract }) {
  const { contract } = props
  const bets = useBets({ contractId: contract.id })
  const [positions, setPositions] = usePersistentInMemoryState<
    undefined | Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
  >(undefined, 'market-card-feed-positions-' + contract.id)
  useEffect(() => {
    getCPMMContractUserContractMetrics(contract.id, 100, db).then(setPositions)
  }, [contract.id])
  if (contract.outcomeType !== 'BINARY') {
    if (!bets) return <LoadingIndicator />
    return (
      <Col className={'mt-2'}>
        <BetsTabContent contract={contract} bets={bets} scrollToTop={false} />
      </Col>
    )
  }

  return (
    <UncontrolledTabs
      tabs={[
        {
          title: 'Positions',
          content: !positions ? (
            <LoadingIndicator />
          ) : (
            <BinaryUserPositionsTable
              contract={contract as CPMMBinaryContract}
              positions={positions}
            />
          ),
        },
        {
          title: 'Trades',
          content: !bets ? (
            <LoadingIndicator />
          ) : (
            <Col className={'mt-2'}>
              <BetsTabContent
                contract={contract}
                bets={bets}
                scrollToTop={false}
              />
            </Col>
          ),
        },
      ]}
    />
  )
}
