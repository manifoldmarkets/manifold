import clsx from 'clsx'
import { filterDefined } from 'common/util/array'
import { Lover } from 'love/hooks/use-lover'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { useUser } from 'web/hooks/use-user'
import { createMatch } from 'web/lib/firebase/love/api'

export const AddAMatchButton = (props: {
  lover: Lover
  potentialLovers: Lover[]
  className?: string
}) => {
  const { lover, potentialLovers, className } = props

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState<number | undefined>(20)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    if (!selectedMatchId || !betAmount) return

    setIsSubmitting(true)
    const result = await createMatch({
      userId1: lover.user_id,
      userId2: selectedMatchId,
      betAmount,
    }).finally(() => {
      setIsSubmitting(false)
    })
    setDialogOpen(false)

    console.log('result', result)

    if (result.success) {
      window.location.reload()
    }
  }
  if (!lover.looking_for_matches)
    return (
      <div className="text-ink-500 text-sm">
        Not looking for more matches right now
      </div>
    )

  return (
    <>
      <Button
        className={clsx(className)}
        color="indigo"
        onClick={() => setDialogOpen(true)}
        disabled={isSubmitting}
        loading={isSubmitting}
      >
        Add a match
      </Button>
      {dialogOpen && (
        <AddMatchDialog
          lover={lover}
          potentialLovers={potentialLovers}
          selectedMatchId={selectedMatchId}
          setSelectedMatchId={setSelectedMatchId}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          isSubmitting={isSubmitting}
          setOpen={setDialogOpen}
          submit={submit}
        />
      )}
    </>
  )
}

const AddMatchDialog = (props: {
  lover: Lover
  potentialLovers: Lover[]
  selectedMatchId: string | null
  setSelectedMatchId: (matchId: string | null) => void
  betAmount: number | undefined
  setBetAmount: (betAmount: number | undefined) => void
  isSubmitting: boolean
  setOpen: (open: boolean) => void
  submit: () => void
}) => {
  const {
    lover,
    potentialLovers,
    selectedMatchId,
    setSelectedMatchId,
    betAmount,
    setBetAmount,
    isSubmitting,
    setOpen,
    submit,
  } = props

  const [error, setError] = useState<string | undefined>(undefined)

  const user = useUser()
  const potentialLoversWithYouFirst = filterDefined([
    potentialLovers.find((lover) => lover.user.id === user?.id),
    ...potentialLovers.filter((lover) => lover.user.id !== user?.id),
  ])

  return (
    <Modal className={SCROLLABLE_MODAL_CLASS} open setOpen={setOpen}>
      <Col className="bg-canvas-0 rounded p-4 pb-8 sm:gap-4">
        <div className="text-lg font-semibold">
          Match {lover.user.name} with...
        </div>

        <Col className="gap-0">
          {potentialLoversWithYouFirst.map((lover) => {
            const selected = selectedMatchId === lover.user.id
            return (
              <Row
                key={lover.id}
                className={clsx(
                  'items-center justify-between px-3 py-2',
                  selected && 'bg-primary-100'
                )}
              >
                <div>{lover.user.name}</div>
                <Button
                  size="xs"
                  color="indigo-outline"
                  onClick={() => setSelectedMatchId(lover.user.id)}
                >
                  Select
                </Button>
              </Row>
            )
          })}
        </Col>

        <Col className="gap-1">
          <div>Choose bet amount (required)</div>
          <BuyAmountInput
            amount={betAmount}
            onChange={setBetAmount}
            minimumAmount={20}
            error={error}
            setError={setError}
            showBalance
          />
        </Col>

        <Button
          className="font-semibold"
          color="green"
          onClick={() => submit()}
          disabled={
            !selectedMatchId || isSubmitting || !betAmount || betAmount < 20
          }
          loading={isSubmitting}
        >
          Submit match
        </Button>
      </Col>
    </Modal>
  )
}
