import { useState } from 'react'
import clsx from 'clsx'
import { InformationCircleIcon } from '@heroicons/react/outline'

import { BinaryContract } from 'common/contract'
import { richTextToString } from 'common/util/parse'
import { useRecentBets } from 'web/hooks/use-bets'
import { BinaryContractChart } from '../charts/contract'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { SizedContainer } from '../sized-container'
import { useTimePicker } from '../contract/contract-overview'
import { Content } from '../widgets/editor'
import { Stats } from '../contract/contract-info-dialog'
import { Spacer } from '../layout/spacer'
import { UserBetsSummary } from '../bet/bet-summary'
import { track } from 'web/lib/service/analytics'

export function MoreSwipeInfo(props: {
  contract: BinaryContract
  setIsModalOpen: (open: boolean) => void
}) {
  const { contract, setIsModalOpen } = props
  const { description } = contract

  const [isOpen, setIsOpen] = useState(false)
  const setAllOpen = (open: boolean) => {
    setIsOpen(open)
    setIsModalOpen(open)
  }

  const descriptionString =
    typeof description === 'string'
      ? description
      : richTextToString(description)

  return (
    <Col
      className={clsx('break-words text-sm font-thin text-white', 'items-end')}
    >
      <div className="line-clamp-3 w-full [text-shadow:_0_1px_0_rgb(0_0_0_/_40%)]">
        {descriptionString}
      </div>

      <span
        className="text-primary-400 mr-2 font-semibold"
        onClick={() => setAllOpen(true)}
      >
        See more
      </span>

      {isOpen && (
        <MoreSwipeInfoDialog
          contract={contract}
          setOpen={setAllOpen}
          open={isOpen}
        />
      )}
    </Col>
  )
}

export function MoreInfoButton(props: {
  contract: BinaryContract
  color: 'gray' | 'white'
  size?: 'md' | 'lg' | 'xl'
}) {
  const { contract, color, size } = props
  const [open, setOpen] = useState(false)

  return (
    <button
      className={clsx(
        'hover:text-ink-600 disabled:opacity-50',
        color === 'white' ? 'text-ink-1000' : 'text-ink-500'
      )}
      onClick={(e) => {
        e.preventDefault()
        setOpen(true)
        track('click feed more info', { contractId: contract.id })
      }}
    >
      <Col className="relative gap-1">
        <InformationCircleIcon
          className={clsx(
            size === 'xl' ? 'h-12 w-12' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'
          )}
        />
      </Col>

      {open && (
        <MoreSwipeInfoDialog
          contract={contract}
          setOpen={setOpen}
          open={open}
        />
      )}
    </button>
  )
}

function MoreSwipeInfoDialog(props: {
  contract: BinaryContract
  setOpen: (open: boolean) => void
  open: boolean
}) {
  const { contract, setOpen, open } = props
  const { description } = contract

  const bets = useRecentBets(contract.id, 1000)
  const betPoints = (bets ?? []).map((bet) => ({
    x: bet.createdTime,
    y: bet.probAfter,
    obj: bet,
  }))
  const { viewScale } = useTimePicker(contract)

  const descriptionString =
    typeof description === 'string'
      ? description
      : richTextToString(description)

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        <SizedContainer className='h-[150px]'>
          {(w, h) => (
            <BinaryContractChart
              width={w}
              height={h}
              betPoints={betPoints}
              viewScaleProps={viewScale}
              controlledStart={
                betPoints.length > 0
                  ? Math.min(...betPoints.map((b) => b.x))
                  : contract.createdTime
              }
              contract={contract}
            />
          )}
        </SizedContainer>

        <Content content={descriptionString} />
        <Spacer h={4} />
        <Stats contract={contract} hideAdvanced />
        <Spacer h={4} />
        <UserBetsSummary contract={contract} />
      </Col>
    </Modal>
  )
}
