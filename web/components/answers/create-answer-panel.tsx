import { useState } from 'react'
import { CPMMMultiContract, MultiContract, SORTS } from 'common/contract'
import { Col } from '../layout/col'
import { api } from 'web/lib/api/api'
import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { MAX_ANSWER_LENGTH, MultiSort } from 'common/answer'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { ExpandingInput } from '../widgets/expanding-input'
import { getTieredAnswerCost } from 'common/economy'
import { Input } from '../widgets/input'
import { getTierFromLiquidity } from 'common/tier'
import clsx from 'clsx'
import DropdownMenu from '../comments/dropdown-menu'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import { ChevronDownIcon } from '@heroicons/react/solid'

export function CreateAnswerCpmmPanel(props: {
  contract: CPMMMultiContract
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
  close?: () => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}) {
  const {
    contract,
    text,
    setText,
    children,
    close,
    placeholder,
    autoFocus,
    className,
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
        setText('')
      } catch (e) {}

      setIsSubmitting(false)
    }
  }

  return (
    <Col className={clsx('gap-1', className)}>
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

function MultiSortDropdown(props: {
  sort: MultiSort
  setSort: (sort: MultiSort) => void
}) {
  const { sort, setSort } = props
  return (
    <DropdownMenu
      closeOnClick
      items={generateFilterDropdownItems(SORTS, setSort)}
      icon={
        <Row className="text-ink-500 items-center gap-0.5">
          <span className="whitespace-nowrap text-sm font-medium">
            {SORTS.find((s) => s.value === sort)?.label}
          </span>
          <ChevronDownIcon className="h-4 w-4" />
        </Row>
      }
      buttonClass={
        'rounded-full bg-ink-100 hover:bg-ink-200 text-ink-600 dark:bg-ink-300 dark:hover:bg-ink-400 py-0.5 text-sm px-3'
      }
    />
  )
}

export function SearchCreateAnswerPanel(props: {
  contract: MultiContract
  canAddAnswer: boolean
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
  setIsSearchOpen?: (isSearchOpen: boolean) => void
  className?: string
  sort: MultiSort
  setSort: (sort: MultiSort) => void
}) {
  const {
    contract,
    canAddAnswer,
    text,
    setText,
    children,
    setIsSearchOpen,
    className,
    sort,
    setSort,
  } = props

  if (canAddAnswer && contract.outcomeType !== 'NUMBER') {
    return (
      <CreateAnswerCpmmPanel
        contract={contract as CPMMMultiContract}
        text={text}
        setText={setText}
        close={() => setIsSearchOpen?.(false)}
        placeholder="Search or add answer"
        autoFocus
        className={className}
      >
        {children}
      </CreateAnswerCpmmPanel>
    )
  }

  return (
    <Row className={clsx('w-full items-center gap-2 py-1', className)}>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="!bg-canvas-50 !h-6 flex-grow !rounded-full !pl-8 !text-sm"
        placeholder="Search answers"
        onBlur={() => !text && setIsSearchOpen?.(false)}
        autoFocus
      />
      <MultiSortDropdown sort={sort} setSort={setSort} />
    </Row>
  )
}
