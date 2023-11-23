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
import { UserPositionsTable } from 'web/components/contract/user-positions-table'
import { getCPMMContractUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Col } from 'web/components/layout/col'
import { useContractVoters } from 'web/hooks/use-votes'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { track } from 'web/lib/service/analytics'
import { Answer } from 'common/answer'
import { useUniqueBettorCountOnAnswer } from 'web/hooks/use-answers'
import { Button, ColorType } from 'web/components/buttons/button'

export function TradesButton(props: {
  contract: Contract
  answer?: Answer
  className?: string
  color?: ColorType
}) {
  const { contract, color, answer, className } = props
  const { uniqueBettorCount: uniqueTraders } = contract
  const uniqueAnswerBettorCount = useUniqueBettorCountOnAnswer(
    contract.id,
    answer?.id
  )
  const [modalOpen, setModalOpen] = useState<boolean>(false)

  const isPoll = contract.outcomeType === 'POLL'
  const isBounty = contract.outcomeType === 'BOUNTIED_QUESTION'

  return (
    <>
      <Button
        size={'2xs'}
        color={color ?? 'gray-white'}
        className={clsx(className)}
        onClick={(e) => {
          track('click feed card traders button', { contractId: contract.id })
          e.preventDefault()
          setModalOpen(true)
        }}
      >
        <Tooltip
          text={isPoll ? 'Voters' : isBounty ? 'Rewards given' : 'Traders'}
          placement="top"
          noTap
        >
          <Row className="relative items-center  gap-1.5 text-sm">
            <UserIcon className="h-5 w-5" />
            {isBounty
              ? contract.bountyTxns.length || ''
              : answer
              ? uniqueAnswerBettorCount
              : uniqueTraders || ''}
          </Row>
        </Tooltip>
      </Button>
      <Modal
        open={modalOpen}
        setOpen={setModalOpen}
        className={clsx(MODAL_CLASS)}
        size={'lg'}
      >
        {modalOpen && (
          <div className={clsx(SCROLLABLE_MODAL_CLASS, 'scrollbar-hide')}>
            {isPoll ? (
              <VotesModalContent contract={contract} />
            ) : (
              <BetsModalContent contract={contract} answer={answer} />
            )}
          </div>
        )}
      </Modal>
    </>
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
            <Row className="items-center gap-2" key={voter.id}>
              <Avatar
                username={voter.username}
                avatarUrl={voter.avatarUrl}
                size={'sm'}
              />
              <UserLink user={voter} />
            </Row>
          )
        })
      )}
    </Col>
  )
}

function BetsModalContent(props: { contract: Contract; answer?: Answer }) {
  const { contract, answer } = props
  const bets = useBets({
    contractId: contract.id,
    answerId: answer?.id,
    filterAntes: true,
    filterRedemptions: true,
  })
  const [positions, setPositions] = usePersistentInMemoryState<
    undefined | Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
  >(undefined, 'market-card-feed-positions-' + contract.id)
  useEffect(() => {
    getCPMMContractUserContractMetrics(
      contract.id,
      100,
      answer?.id ?? null,
      db
    ).then(setPositions)
  }, [contract.id])

  return (
    <UncontrolledTabs
      tabs={[
        {
          title: 'Positions',
          content: !positions ? (
            <LoadingIndicator />
          ) : (
            <UserPositionsTable
              contract={contract as CPMMBinaryContract}
              positions={positions}
              answer={answer}
            />
          ),
        },
        {
          title: 'Recent Trades',
          content: !bets ? (
            <LoadingIndicator />
          ) : (
            <Col className={'mt-2'}>
              <BetsTabContent
                contract={contract}
                bets={bets}
                totalBets={bets.length}
              />
            </Col>
          ),
        },
      ]}
    />
  )
}
