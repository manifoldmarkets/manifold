import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { ChevronDownIcon, XCircleIcon } from '@heroicons/react/solid'
import { FaSearch, FaSearchPlus } from 'react-icons/fa'
import { InfoTooltip } from '../widgets/info-tooltip'

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
        'h-8 rounded-full bg-ink-100 hover:bg-ink-200 text-ink-600 dark:bg-ink-300 dark:hover:bg-ink-400 py-1 text-sm px-3'
      }
    />
  )
}

export function SearchCreateAnswerPanel(props: {
  contract: MultiContract
  canAddAnswer: boolean
  text: string
  setText: (text: string) => void
  setIsSearchOpen?: (isSearchOpen: boolean) => void
  className?: string
  sort: MultiSort
  setSort: (sort: MultiSort) => void
  showDefaultSort?: boolean
  setDefaultSort: () => void
}) {
  const {
    contract,
    text,
    setText,
    setIsSearchOpen,
    className,
    sort,
    setSort,
    showDefaultSort,
    setDefaultSort,
  } = props

  const canAddAnswer = props.canAddAnswer && contract.outcomeType !== 'NUMBER'

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
      setSort('new')
    }
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const buttonsRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (inputRef.current && buttonsRef.current) {
      const buttonsWidth = buttonsRef.current.offsetWidth
      inputRef.current.style.paddingRight = `${buttonsWidth + 8}px`
    }
  }, [text, canAddAnswer])

  return (
    <Col className={clsx(className)}>
      <Row className={'w-full items-center gap-1 py-1 sm:gap-2'}>
        <div className="relative w-full">
          <Input
            value={text}
            ref={inputRef}
            onChange={(e) => setText(e.target.value)}
            className="!bg-canvas-50 !h-8 w-full flex-grow !rounded-full !pl-7 !text-sm"
            placeholder={
              canAddAnswer ? 'Search or Add answers' : 'Search answers'
            }
            onBlur={() => !text && setIsSearchOpen?.(false)}
          />
          {canAddAnswer ? (
            <FaSearchPlus className="text-ink-400 dark:text-ink-500 absolute left-2 top-2 h-4 w-4 " />
          ) : (
            <FaSearch className="text-ink-400 dark:text-ink-500 absolute left-2 top-2 h-4 w-4" />
          )}
          {(text || canAddAnswer) && (
            <Row
              ref={buttonsRef}
              className="absolute right-1 top-0.5 items-center gap-0.5"
            >
              {text && (
                <button
                  className={clsx('group h-full')}
                  onClick={() => (setText(''), close?.())}
                >
                  <XCircleIcon className="fill-ink-300 group-hover:fill-ink-400 h-7 w-7 items-center transition-colors" />
                </button>
              )}

              {canAddAnswer && text && (
                <Button
                  className="!rounded-full"
                  size="2xs"
                  loading={isSubmitting}
                  disabled={!canSubmit}
                  onClick={withTracking(submitAnswer, 'submit answer')}
                >
                  <span className="font-semibold">Add</span>
                  <span className="text-ink-200 dark:text-ink-800 ml-1">
                    {formatMoney(
                      getTieredAnswerCost(
                        contract.marketTier ??
                          getTierFromLiquidity(
                            contract,
                            contract.totalLiquidity
                          )
                      )
                    )}
                  </span>
                </Button>
              )}
            </Row>
          )}
        </div>
        <MultiSortDropdown sort={sort} setSort={setSort} />
      </Row>
      {showDefaultSort && (
        <Row className="text-primary-700 flex-grow items-center justify-end gap-0.5 text-xs font-semibold">
          <button className="hover:underline" onClick={setDefaultSort}>
            Set default
          </button>
          <div className="mb-1 flex items-center">
            <InfoTooltip
              size="sm"
              text={`This sets the default sort order to ${
                SORTS.find((s) => s.value === sort)?.label
              } for all users`}
              tooltipParams={{ placement: 'bottom' }}
            />
          </div>
        </Row>
      )}
    </Col>
  )
}
