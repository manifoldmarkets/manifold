import clsx from 'clsx'
import { Editor } from '@tiptap/react'
import { useState, useEffect } from 'react'

import { MAX_COMMENT_LENGTH } from 'common/comment'
import { MIN_BET_AMOUNT_FOR_NEW_MATCH } from 'common/love/constants'
import { Lover } from 'common/love/lover'
import { LoverProfile } from 'love/pages/[username]'
import { Button } from 'web/components/buttons/button'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { Col } from 'web/components/layout/col'
import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { ControlledTabs } from 'web/components/layout/tabs'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { useTextEditor } from 'web/components/widgets/editor'
import { createMatch } from 'web/lib/firebase/love/api'
import { useUser } from 'web/hooks/use-user'
import { CompatibilityScore } from 'common/love/compatibility-score'

export const BrowseMatchesButton = (props: {
  lover: Lover
  matchedLovers: Lover[]
  potentialLovers: Lover[]
  compatibilityScores: Record<string, CompatibilityScore>
  className?: string
}) => {
  const {
    lover,
    matchedLovers,
    potentialLovers,
    compatibilityScores,
    className,
  } = props

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState<number | undefined>(
    MIN_BET_AMOUNT_FOR_NEW_MATCH
  )
  const key = `comment ${potentialLovers.map((l) => l.id).join(',')}`
  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder: 'Write your introduction...',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    if (!selectedMatchId || !betAmount) return

    const introduction =
      (editor?.getCharacterCount() ?? 0) > 0 ? editor?.getJSON() : undefined

    setIsSubmitting(true)
    const result = await createMatch({
      userId1: lover.user_id,
      userId2: selectedMatchId,
      betAmount,
      introduction,
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
          compatibilityScores={compatibilityScores}
          selectedMatchId={selectedMatchId}
          setSelectedMatchId={setSelectedMatchId}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          isSubmitting={isSubmitting}
          setOpen={setDialogOpen}
          submit={submit}
          editor={editor}
        />
      )}
    </>
  )
}

const BrowseMatchesDialog = (props: {
  lover: Lover
  matchedLovers: Lover[]
  potentialLovers: Lover[]
  compatibilityScores: Record<string, CompatibilityScore>
  selectedMatchId: string | null
  setSelectedMatchId: (matchId: string | null) => void
  betAmount: number | undefined
  setBetAmount: (betAmount: number | undefined) => void
  isSubmitting: boolean
  setOpen: (open: boolean) => void
  submit: () => void
  editor: Editor | null
}) => {
  const {
    lover,
    matchedLovers,
    potentialLovers,
    compatibilityScores,
    selectedMatchId,
    setSelectedMatchId,
    betAmount,
    setBetAmount,
    isSubmitting,
    setOpen,
    submit,
    editor,
  } = props

  const [error, setError] = useState<string | undefined>(undefined)

  const [matchedIndex, setMatchedIndex] = useState(0)
  const [potentialIndex, setPotentialIndex] = useState(0)
  const matchedLover = matchedLovers[matchedIndex]
  const potentialLover = potentialLovers[potentialIndex]
  const [tab, setTab] = useState<number>(matchedLover ? 0 : 1)

  const compatibility =
    tab === 0
      ? matchedLover
        ? compatibilityScores[matchedLover.user_id]
        : undefined
      : potentialLover
      ? compatibilityScores[potentialLover.user_id]
      : undefined

  const user = useUser()

  useEffect(() => {
    if (tab === 0 && matchedLover) {
      setSelectedMatchId(matchedLover.user.id)
    } else if (tab === 1 && potentialLover) {
      setSelectedMatchId(potentialLover.user.id)
    }
  }, [tab, matchedLover, potentialLover])

  return (
    <Modal className={SCROLLABLE_MODAL_CLASS} size="lg" open setOpen={setOpen}>
      <Col className="bg-canvas-0 rounded p-4 pb-8 sm:gap-4">
        <ControlledTabs
          activeIndex={tab}
          onClick={(_title, index) => setTab(index)}
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
                          onClick={() => {
                            setMatchedIndex(
                              (matchedIndex - 1 + matchedLovers.length) %
                                matchedLovers.length
                            )
                            setSelectedMatchId(matchedLover.user.id)
                          }}
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
                        {compatibility &&
                          compatibility.confidence !== 'low' && (
                            <div>
                              Compatibility{' '}
                              <span className="text-primary-600 font-semibold">
                                {Math.round((compatibility.score ?? 0) * 100) /
                                  10}{' '}
                                out of 10
                              </span>
                            </div>
                          )}
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

                  {potentialLovers.length > 0 && (
                    <>
                      {compatibility && compatibility.confidence !== 'low' && (
                        <div>
                          Compatibility{' '}
                          <span className="text-primary-600 font-semibold">
                            {Math.round((compatibility.score ?? 0) * 100) / 10}{' '}
                            out of 10
                          </span>
                        </div>
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
                            minimumAmount={MIN_BET_AMOUNT_FOR_NEW_MATCH}
                            error={error}
                            setError={setError}
                            showBalance
                          />
                        </Col>

                        <CommentInputTextArea
                          isSubmitting={isSubmitting}
                          editor={editor}
                          user={user}
                          hideToolbar={true}
                        />

                        <Button
                          className="font-semibold"
                          color="green"
                          onClick={() => submit()}
                          disabled={
                            !selectedMatchId ||
                            isSubmitting ||
                            !betAmount ||
                            betAmount < MIN_BET_AMOUNT_FOR_NEW_MATCH
                          }
                          loading={isSubmitting}
                        >
                          Submit match
                        </Button>
                      </Col>
                    </>
                  )}
                </Col>
              ),
            },
          ]}
        />
      </Col>
    </Modal>
  )
}
