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
import { useContractVoters } from 'web/hooks/use-votes'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'

export function TradesButton(props: { contract: Contract }) {
  const { contract } = props
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [uniqueTraders, setUniqueTraders] = useState(contract.uniqueBettorCount)
  useEffect(() => {
    setUniqueTraders(contract.uniqueBettorCount)
  }, [contract.uniqueBettorCount])
  const isPoll = contract.outcomeType === 'POLL'
  return (
    <button
      disabled={uniqueTraders === 0}
      className={clsx(
        'text-ink-500 transition-transform disabled:cursor-not-allowed'
      )}
      onClick={(e) => {
        e.preventDefault()
        setModalOpen(true)
      }}
    >
      <Row className="relative gap-1.5 text-sm">
        <Tooltip
          text={'Traders'}
          placement={'top'}
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
          {isPoll && <span> voters</span>}
        </div>
        <div className={clsx(SCROLLABLE_MODAL_CLASS, 'scrollbar-hide')}>
          {/*In case we need it:*/}
          {/*<span className={'text-ink-500 text-xs'}>*/}
          {/*  Currently held positions may not equal total traders*/}
          {/*</span>*/}
          {isPoll && <VotesModalContent contract={contract} />}
          {!isPoll && <BetsModalContent contract={contract} />}
        </div>
      </Modal>
    </button>
  )
}

function VotesModalContent(props: { contract: Contract }) {
  const { contract } = props
  const voters = useContractVoters(contract.id)

  return (
    <Col className="mt-4 gap-3">
      {!voters ? (
        <LoadingIndicator />
      ) : voters.length == 0 ? (
        'No votes yet...'
      ) : (
        voters.map((voter) => {
          return (
            <Row className="items-center gap-2">
              <Avatar
                username={voter.username}
                avatarUrl={voter.avatarUrl}
                size={'sm'}
              />
              <UserLink name={voter.name} username={voter.username} />
            </Row>
          )
        })
      )}
    </Col>
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
        <BetsTabContent contract={contract} bets={bets} />
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
              <BetsTabContent contract={contract} bets={bets} />
            </Col>
          ),
        },
      ]}
    />
  )
}
