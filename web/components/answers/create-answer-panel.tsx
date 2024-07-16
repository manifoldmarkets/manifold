import { useState } from 'react'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { Col } from '../layout/col'
import { api } from 'web/lib/api/api'
import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { ExpandingInput } from '../widgets/expanding-input'
import { getTieredAnswerCost } from 'common/economy'
import { Input } from '../widgets/input'
import { getTierFromLiquidity } from 'common/tier'

export function CreateAnswerCpmmPanel(props: {
  contract: CPMMMultiContract
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
  close?: () => void
  placeholder?: string
  autoFocus?: boolean
  onCreateAnswer?: () => void
}) {
  const {
    contract,
    text,
    setText,
    children,
    close,
    placeholder,
    autoFocus,
    onCreateAnswer,
  } = props

  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = text && !isSubmitting

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)

      try {
        await api('market/:contractId/answer', {
          contractId: contract.id,
          text,
        })
      } catch (e) {}
      if (onCreateAnswer) {
        onCreateAnswer()
      }
      setText('')
      setIsSubmitting(false)
    }
  }

  return (
    <Col className="gap-1">
      <ExpandingInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full"
        placeholder={placeholder ?? 'Search or add answer'}
        rows={1}
        maxLength={MAX_ANSWER_LENGTH}
        onBlur={() => !text && close?.()}
        autoFocus={autoFocus}
      />

      <Row className="justify-between">
        {children}

        <Row className="gap-1">
          {text && (
            <Button
              size="2xs"
              color="gray"
              onClick={() => (setText(''), close?.())}
            >
              Clear
            </Button>
          )}
          <Button
            size="2xs"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={withTracking(submitAnswer, 'submit answer')}
          >
            Add answer (
            {formatMoney(
              getTieredAnswerCost(
                contract.marketTier ??
                  getTierFromLiquidity(contract, contract.totalLiquidity)
              )
            )}
            )
          </Button>
        </Row>
      </Row>
    </Col>
  )
}

export function SearchCreateAnswerPanel(props: {
  contract: MultiContract
  canAddAnswer: boolean
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
  isSearchOpen?: boolean
  setIsSearchOpen?: (isSearchOpen: boolean) => void
  onCreateAnswer?: () => void
}) {
  const {
    contract,
    canAddAnswer,
    text,
    setText,
    children,
    isSearchOpen,
    setIsSearchOpen,
    onCreateAnswer,
  } = props

  if (!isSearchOpen) return <>{children}</>

  if (canAddAnswer && contract.outcomeType !== 'NUMBER') {
    return (
      <CreateAnswerCpmmPanel
        contract={contract as CPMMMultiContract}
        text={text}
        setText={setText}
        close={() => setIsSearchOpen?.(false)}
        placeholder="Search or add answer"
        autoFocus
        onCreateAnswer={onCreateAnswer}
      >
        {children}
      </CreateAnswerCpmmPanel>
    )
  }

  return (
    <>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="!text-md"
        placeholder="Search answers"
        onBlur={() => !text && setIsSearchOpen?.(false)}
        autoFocus
      />
      {children}
    </>
  )
}
