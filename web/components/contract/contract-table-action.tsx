import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { useAdmin } from 'web/hooks/use-admin'
import { firebaseLogin } from 'web/lib/firebase/users'
import { BetDialog } from '../bet/bet-dialog'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { NumericResolutionPanel } from '../numeric-resolution-panel'
import { ResolutionPanel } from '../resolution-panel'
import { isClosed } from './contracts-table'
import { AnswersResolvePanel } from '../answers/answer-resolve-panel'
import { useUser } from 'web/hooks/use-user'

export function Action(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  return (
    <Row className="h-min flex-wrap gap-2 align-top">
      <BetButton contract={contract} user={user} />
      <ResolveButton contract={contract} user={user} />
    </Row>
  )
}

export function BetButton(props: { contract: Contract; user?: User | null }) {
  const { contract, user } = props
  const [open, setOpen] = useState(false)
  if (
    !isClosed(contract) &&
    !contract.isResolved &&
    contract.outcomeType === 'BINARY' &&
    contract.mechanism === 'cpmm-1'
  ) {
    return (
      <>
        <Button
          size="2xs"
          color="indigo-outline"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!user) {
              firebaseLogin()
              return
            }
            setOpen(true)
          }}
        >
          Bet
        </Button>
        {open && (
          <BetDialog
            contract={contract}
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

export function ResolveButton(props: {
  contract: Contract
  user?: User | null
}) {
  const { contract, user } = props
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
        )}
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
  return outcomeType === 'PSEUDO_NUMERIC' ? (
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
  ) : outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE' ? (
    <Col className="w-full">
      <AnswersResolvePanel contract={contract} />
    </Col>
  ) : (
    <></>
  )
}
