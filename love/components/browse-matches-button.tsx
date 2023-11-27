import clsx from 'clsx'
import { Lover } from 'common/love/lover'
import { LoverProfile } from 'love/pages/[username]'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Tabs } from 'web/components/layout/tabs'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { createMatch } from 'web/lib/firebase/love/api'

export const BrowseMatchesButton = (props: {
  lover: Lover
  matchedLovers: Lover[]
  potentialLovers: Lover[]
  className?: string
}) => {
  const { lover, matchedLovers, potentialLovers, className } = props

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
      introduction: undefined,
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
        Browse matches
      </Button>
      {dialogOpen && (
        <BrowseMatchesDialog
          lover={lover}
          matchedLovers={matchedLovers}
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

const BrowseMatchesDialog = (props: {
  lover: Lover
  matchedLovers: Lover[]
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
    matchedLovers,
    potentialLovers,
    selectedMatchId,
    betAmount,
    setBetAmount,
    isSubmitting,
    setOpen,
    submit,
  } = props

  const [error, setError] = useState<string | undefined>(undefined)

  const [matchedIndex, setMatchedIndex] = useState(0)
  const [potentialIndex, setPotentialIndex] = useState(0)
  const matchedLover = matchedLovers[matchedIndex]
  const potentialLover = potentialLovers[potentialIndex]

  return (
    <Modal className={SCROLLABLE_MODAL_CLASS} size="md" open setOpen={setOpen}>
      <Col className="bg-canvas-0 rounded p-4 pb-8 sm:gap-4">
        <Tabs
          tabs={[
            {
              title: `Matches ${matchedLovers.length}`,
              content: (
                <Col>
                  {matchedLovers.length === 0 ? (
                    <div>No current matches.</div>
                  ) : (
                    <>
                      <Row className="mb-2 items-center gap-4">
                        <Button
                          color="gray-outline"
                          onClick={() =>
                            setMatchedIndex(
                              (matchedIndex - 1 + matchedLovers.length) %
                                matchedLovers.length
                            )
                          }
                        >
                          Previous
                        </Button>
                        <div>
                          {matchedIndex + 1} / {matchedLovers.length}
                        </div>
                        <Button
                          color="gray-outline"
                          onClick={() =>
                            setMatchedIndex(
                              (matchedIndex + 1) % matchedLovers.length
                            )
                          }
                        >
                          Next
                        </Button>
                      </Row>
                      <Col>
                        <LoverProfile
                          lover={matchedLover}
                          user={matchedLover.user}
                          refreshLover={() => window.location.reload()}
                          hideMatches
                        />
                      </Col>
                    </>
                  )}
                </Col>
              ),
            },
            {
              title: `Compatible ${potentialLovers.length}`,
              content: (
                <Col>
                  {potentialLovers.length === 0 ? (
                    <div>No remaining compatible matches.</div>
                  ) : (
                    <Row className="mb-2 items-center gap-4">
                      <Button
                        color="gray-outline"
                        onClick={() =>
                          setPotentialIndex(
                            (potentialIndex - 1 + potentialLovers.length) %
                              potentialLovers.length
                          )
                        }
                      >
                        Previous
                      </Button>
                      <div>
                        {potentialIndex + 1} / {potentialLovers.length}
                      </div>
                      <Button
                        color="gray-outline"
                        onClick={() =>
                          setPotentialIndex(
                            (potentialIndex + 1) % potentialLovers.length
                          )
                        }
                      >
                        Next
                      </Button>
                    </Row>
                  )}

                  <LoverProfile
                    lover={potentialLover}
                    user={potentialLover.user}
                    refreshLover={() => window.location.reload()}
                    hideMatches
                  />

                  <Col key={lover.id} className={clsx('gap-4 px-3 py-2')}>
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
                        !selectedMatchId ||
                        isSubmitting ||
                        !betAmount ||
                        betAmount < 20
                      }
                      loading={isSubmitting}
                    >
                      Submit match
                    </Button>
                  </Col>
                </Col>
              ),
            },
          ]}
        />
      </Col>
    </Modal>
  )
}
