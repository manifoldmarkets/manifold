import { ChevronDownIcon, XCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { MultiSort } from 'common/answer'
import { MultiContract, SORTS } from 'common/contract'
import { getAnswerCostFromLiquidity } from 'common/tier'
import { useLayoutEffect, useRef, useState } from 'react'
import { FaSearch } from 'react-icons/fa'
import { api } from 'web/lib/api/api'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import DropdownMenu from '../widgets/dropdown-menu'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Input } from '../widgets/input'
import { MoneyDisplay } from '../bet/money-display'

function MultiSortDropdown(props: {
  sort: MultiSort
  setSort: (sort: MultiSort) => void
}) {
  const { sort, setSort } = props
  return (
    <DropdownMenu
      closeOnClick
      items={generateFilterDropdownItems(SORTS, setSort)}
      buttonContent={
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

  const canAddAnswer = props.canAddAnswer

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddingAnswer, setIsAddingAnswer] = useState(false)

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

  const handleAddAnswerClick = () => {
    if (!text) {
      setIsAddingAnswer(true)
      inputRef.current?.focus()
    } else {
      submitAnswer()
    }
  }

  const isCashContract = contract.token === 'CASH'

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
            onChange={(e) => {
              setText(e.target.value)
              if (isAddingAnswer) {
                setIsAddingAnswer(false)
              }
            }}
            className="!bg-canvas-50 !h-8 w-full flex-grow !rounded-full !pl-7 !text-sm"
            placeholder={
              isAddingAnswer
                ? 'Enter new answer'
                : canAddAnswer
                ? 'Search or add answer'
                : 'Search answers'
            }
            onBlur={() => {
              if (!text) {
                setIsSearchOpen?.(false)
                setIsAddingAnswer(false)
              }
            }}
          />
          <FaSearch className="text-ink-400 dark:text-ink-500 absolute left-2 top-2 h-4 w-4" />
          {(text || canAddAnswer) && (
            <Row
              ref={buttonsRef}
              className="absolute right-1 top-0.5 h-7 items-center gap-0.5 "
            >
              {text && (
                <button
                  className={clsx('group h-full')}
                  onClick={() => setText('')}
                >
                  <XCircleIcon className="fill-ink-300 group-hover:fill-ink-400 h-7 w-7 items-center transition-colors" />
                </button>
              )}

              {canAddAnswer && (
                <Button
                  className=" !rounded-full"
                  size="2xs"
                  color={text ? 'indigo' : 'indigo-outline'}
                  loading={isSubmitting}
                  onClick={withTracking(handleAddAnswerClick, 'submit answer')}
                >
                  <span className="">Add</span>
                  {text ? (
                    <span className="text-ink-200 dark:text-ink-800 ml-1">
                      <MoneyDisplay
                        amount={getAnswerCostFromLiquidity(
                          contract.totalLiquidity,
                          contract.answers.length
                        )}
                        isCashContract={isCashContract}
                      />
                    </span>
                  ) : (
                    <span className="ml-1">answer</span>
                  )}
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
