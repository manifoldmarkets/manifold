import { Contract } from 'common/contract'
import { useState } from 'react'

import { Modal } from 'components/layout/modal'

import { ContractMetric } from 'common/contract-metric'

import { BetPanelContent } from 'components/contract/bet/bet-panel'
import { PositionModalContent } from './position-modal-content'

export type PositionModalMode = 'base' | 'buy more' | 'sell'

export function PositionModal({
  contract,
  metric,
  open,
  setOpen,
  answerId,
}: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  metric: ContractMetric
  answerId?: string
}) {
  const [mode, setMode] = useState<PositionModalMode>('base')
  const outcome = (metric.maxSharesOutcome ?? 'YES') as 'YES' | 'NO'

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} mode="close" showHeader>
      {mode == 'base' || mode == 'sell' ? (
        <PositionModalContent
          contract={contract}
          metric={metric}
          answerId={answerId}
          outcome={outcome}
          setOpen={setOpen}
          mode={mode}
          setMode={setMode}
        />
      ) : (
        <BetPanelContent
          contract={contract}
          outcome={outcome}
          multiProps={
            contract.answers
              ? {
                  answers: contract.answers,
                  answerToBuy: answer,
                }
              : undefined
          }
          setOpen={setOpen}
        />
      )}
    </Modal>
  )
}
