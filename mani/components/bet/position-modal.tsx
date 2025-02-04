import { Contract } from 'common/contract'
import { useState } from 'react'

import { Modal } from 'components/layout/modal'

import { ContractMetric } from 'common/contract-metric'

import { BetPanelContent } from 'components/contract/bet/bet-panel'
import { PositionModalContent } from './position-modal-content'
import { PositionModalConfirmation } from './position-modal-confirmation'

export type PositionModalMode = 'base' | 'buy more' | 'sell' | 'confirmation'

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
  const [saleDetails, setSaleDetails] = useState<{
    amount: number
    saleValue: number
    profit: number
  } | null>(null)
  const outcome = (metric.maxSharesOutcome ?? 'YES') as 'YES' | 'NO'

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        setMode('base')
        setOpen(false)
      }}
      onBack={
        mode !== 'base'
          ? () => {
              setMode('base')
            }
          : undefined
      }
      showHeader
    >
      {mode === 'confirmation' && saleDetails ? (
        <PositionModalConfirmation
          contract={contract}
          saleDetails={saleDetails}
          setOpen={setOpen}
        />
      ) : mode === 'base' || mode === 'sell' ? (
        <PositionModalContent
          contract={contract}
          metric={metric}
          answerId={answerId}
          outcome={outcome}
          setOpen={setOpen}
          mode={mode}
          setMode={setMode}
          onSaleSuccess={(details) => {
            setSaleDetails(details)
            setMode('confirmation')
          }}
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
