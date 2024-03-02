import {
  Contract,
  CPMMBinaryContract,
  CPMMMultiContract,
} from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { firebaseLogin } from 'web/lib/firebase/users'
import { BetDialog, MultiBetDialog } from '../bet/bet-dialog'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { NumericResolutionPanel } from '../numeric-resolution-panel'
import { ResolutionPanel } from '../resolution-panel'
import { isClosed } from './contracts-table'
import { AnswersResolvePanel } from '../answers/answer-resolve-panel'
import { useUser } from 'web/hooks/use-user'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'

export function Action(props: { contract: Contract }) {
  const { contract } = props
  return (
    <Row className="h-min flex-wrap gap-2 align-top">
      <BetButton contract={contract} />
      <ResolveButton contract={contract} />
    </Row>
  )
}

export function BetButton(props: { contract: Contract; user?: User | null }) {
  const { contract } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  const [openMC, setOpenMC] = useState(false)
  if (
    !isClosed(contract) &&
    !contract.isResolved &&
    ((contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1') ||
      contract.mechanism === 'cpmm-multi-1')
  ) {
    return (
      <>
        <Button
          size="2xs"
          color="indigo-outline"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            track('bet intent', { location: 'contract table' })
            if (!user) {
              firebaseLogin()
              return
            }
            if (contract.mechanism === 'cpmm-1') {
              setOpen(true)
            } else {
              setOpenMC(true)
            }
          }}
        >
          Bet
        </Button>
        {openMC && (
          <MultiBetDialog
            contract={contract as CPMMMultiContract}
            open={openMC}
            setOpen={setOpenMC}
          />
        )}
        {open && (
          <BetDialog
            contract={contract as CPMMBinaryContract}
            initialOutcome="YES"
            open={open}
            setOpen={setOpen}
            trackingLocation="contract table"
          />
        )}
      </>
    )
  }
  return <></>
}

export function ResolveButton(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  const isClosed = contract.closeTime && contract.closeTime < Date.now()
  if (
    user &&
    isClosed &&
    !contract.isResolved &&
    contract.creatorId === user?.id &&
    (contract.outcomeType === 'PSEUDO_NUMERIC' ||
      contract.outcomeType === 'BINARY' ||
      contract.outcomeType === 'QUADRATIC_FUNDING' ||
      contract.outcomeType === 'MULTIPLE_CHOICE' ||
      contract.outcomeType === 'FREE_RESPONSE')
  ) {
    return (
      <>
        <Button
          size="2xs"
          color={isClosed ? 'red' : 'gray-outline'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
          }}
        >
          Resolve
        </Button>
        {open && (
          <Modal open={open} setOpen={setOpen} size="md">
            <Col className={clsx(MODAL_CLASS, 'items-stretch !gap-0')}>
              <SmallResolutionPanel contract={contract} setOpen={setOpen} />
            </Col>
          </Modal>
        )}
      </>
    )
  }
  return <></>
}

export function SmallResolutionPanel(props: {
  contract: Contract
  setOpen: (open: boolean) => void
}) {
  const { contract, setOpen } = props
  const outcomeType = contract.outcomeType
  return outcomeType === 'PSEUDO_NUMERIC' ? (
    <NumericResolutionPanel
      contract={contract}
      onClose={() => setOpen(false)}
      inModal
    />
  ) : outcomeType === 'BINARY' ? (
    <ResolutionPanel
      contract={contract}
      onClose={() => setOpen(false)}
      inModal
    />
  ) : outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE' ? (
    <Col className="w-full">
      <AnswersResolvePanel
        contract={contract}
        onClose={() => setOpen(false)}
        inModal
      />
    </Col>
  ) : (
    <></>
  )
}
