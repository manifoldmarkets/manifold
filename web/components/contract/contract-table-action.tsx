import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { useAdmin } from 'web/hooks/use-admin'
import { firebaseLogin } from 'web/lib/firebase/users'
import { AnswersPanel } from '../answers/answers-panel'
import { BetDialog } from '../bet/bet-dialog'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { NumericResolutionPanel } from '../numeric-resolution-panel'
import { ResolutionPanel } from '../resolution-panel'
import { QfResolutionPanel } from './qf-overview'

export function Action(props: { contract: Contract; user?: User | null }) {
  const { contract, user } = props
  return (
    <Row className="flex-wrap gap-2">
      <BetButton contract={contract} user={user} />
      <ResolveButton contract={contract} user={user} />
    </Row>
  )
}

export function BetButton(props: { contract: Contract; user?: User | null }) {
  const { contract, user } = props
  const [open, setOpen] = useState(false)
  const isClosed = contract.closeTime && contract.closeTime < Date.now()
  // const [outcome, setOutcome] = useState<binaryOutcomes>()
  if (
    !(isClosed && contract.creatorId === user?.id) &&
    contract.outcomeType === 'BINARY' &&
    contract.mechanism === 'cpmm-1' &&
    // !isClosed &&
    !contract.isResolved
  ) {
    return (
      <>
        <Button
          size="2xs"
          color="indigo"
          onClick={(e) => {
            e.stopPropagation()
            if (!user) {
              firebaseLogin()
              return
            }
            // setOutcome('YES')
            setOpen(true)
          }}
          disabled={isClosed || contract.isResolved}
        >
          Bet
        </Button>
        <BetDialog
          contract={contract}
          initialOutcome="YES"
          open={open}
          setOpen={setOpen}
          trackingLocation="contract table"
        />
      </>
    )
  }
  return <></>
}

export function ResolveButton(props: {
  contract: Contract
  user?: User | null
}) {
  const { contract, user } = props
  const [open, setOpen] = useState(false)
  const isClosed = contract.closeTime && contract.closeTime < Date.now()
  if (
    user &&
    contract.creatorId === user?.id &&
    // !contract.isResolved &&
    (contract.outcomeType === 'NUMERIC' ||
      contract.outcomeType === 'PSEUDO_NUMERIC' ||
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
          disabled={contract.isResolved}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
        >
          {contract.isResolved ? <>Resolved</> : <>Resolve</>}
        </Button>
        <Modal open={open} setOpen={setOpen}>
          <Col className={MODAL_CLASS}>
            <Col className="w-full">
              <SmallResolutionPanel
                contract={contract}
                user={user}
                setOpen={setOpen}
              />
            </Col>
          </Col>
        </Modal>
      </>
    )
  }
  return <></>
}

export function SmallResolutionPanel(props: {
  contract: Contract
  user: User
  setOpen: (open: boolean) => void
}) {
  const { contract, user, setOpen } = props
  const outcomeType = contract.outcomeType
  const isAdmin = useAdmin()
  return outcomeType === 'NUMERIC' || outcomeType === 'PSEUDO_NUMERIC' ? (
    <NumericResolutionPanel
      isAdmin={!!isAdmin}
      creator={user}
      isCreator={!isAdmin}
      contract={contract}
      modalSetOpen={setOpen}
    />
  ) : outcomeType === 'BINARY' ? (
    <ResolutionPanel
      isAdmin={!!isAdmin}
      creator={user}
      isCreator={!isAdmin}
      contract={contract}
      modalSetOpen={setOpen}
    />
  ) : outcomeType === 'QUADRATIC_FUNDING' ? (
    <QfResolutionPanel contract={contract} />
  ) : outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE' ? (
    <AnswersPanel
      contract={contract}
      onAnswerCommentClick={() => {
        console.log('YOU FOOL')
      }}
      showResolver={true}
      modalSetOpen={setOpen}
    />
  ) : (
    <></>
  )
}
