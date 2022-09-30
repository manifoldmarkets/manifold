import clsx from 'clsx'
import React, { useState } from 'react'
import { clamp, partition, sumBy } from 'lodash'

import { useUser } from 'web/hooks/use-user'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import {
  formatLargeNumber,
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { getBinaryBetStats, getBinaryCpmmBetInfo } from 'common/new-bet'
import { User } from 'web/lib/firebase/users'
import { Bet, LimitBet } from 'common/bet'
import { APIError, placeBet, sellShares } from 'web/lib/firebase/api'
import { AmountInput, BuyAmountInput } from './amount-input'
import {
  BinaryOutcomeLabel,
  HigherLabel,
  LowerLabel,
  NoLabel,
  YesLabel,
} from './outcome-label'
import { getProbability } from 'common/calculate'
import { useFocus } from 'web/hooks/use-focus'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { calculateCpmmSale, getCpmmProbability } from 'common/calculate-cpmm'
import { getFormattedMappedValue, getMappedValue } from 'common/pseudo-numeric'
import { SellRow } from './sell-row'
import { useSaveBinaryShares } from './use-save-binary-shares'
import { BetSignUpPrompt } from './sign-up-prompt'
import { ProbabilityOrNumericInput } from './probability-input'
import { track } from 'web/lib/service/analytics'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { LimitBets } from './limit-bets'
import { PillButton } from './buttons/pill-button'
import { YesNoSelector } from './yes-no-selector'
import { PlayMoneyDisclaimer } from './play-money-disclaimer'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { WarningConfirmationButton } from './warning-confirmation-button'
import { MarketIntroPanel } from './market-intro-panel'
import { Modal } from './layout/modal'
import { Title } from './title'
import toast from 'react-hot-toast'
import { CheckIcon } from '@heroicons/react/solid'
import { useWindowSize } from 'web/hooks/use-window-size'

export function BetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const unfilledBets = useUnfilledBets(contract.id) ?? []
  const { sharesOutcome } = useSaveBinaryShares(contract, userBets)

  const [isLimitOrder, setIsLimitOrder] = useState(false)

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'rounded-t-md bg-gray-100 px-4 py-5'}
      />
      <Col
        className={clsx(
          'relative rounded-b-md bg-white px-6 py-6',
          !sharesOutcome && 'rounded-t-md',
          className
        )}
      >
        {user ? (
          <>
            <QuickOrLimitBet
              isLimitOrder={isLimitOrder}
              setIsLimitOrder={setIsLimitOrder}
              hideToggle={!user}
            />
            <BuyPanel
              hidden={isLimitOrder}
              contract={contract}
              user={user}
              unfilledBets={unfilledBets}
            />
            <LimitOrderPanel
              hidden={!isLimitOrder}
              contract={contract}
              user={user}
              unfilledBets={unfilledBets}
            />
          </>
        ) : (
          <MarketIntroPanel />
        )}
      </Col>

      {user && unfilledBets.length > 0 && (
        <LimitBets className="mt-4" contract={contract} bets={unfilledBets} />
      )}
    </Col>
  )
}

export function SimpleBetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  hasShares?: boolean
  onBetSuccess?: () => void
}) {
  const { contract, className, hasShares, onBetSuccess } = props

  const user = useUser()
  const [isLimitOrder, setIsLimitOrder] = useState(false)

  const unfilledBets = useUnfilledBets(contract.id) ?? []

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'rounded-t-md bg-gray-100 px-4 py-5'}
      />
      <Col
        className={clsx(
          !hasShares && 'rounded-t-md',
          'rounded-b-md bg-white px-8 py-6'
        )}
      >
        <QuickOrLimitBet
          isLimitOrder={isLimitOrder}
          setIsLimitOrder={setIsLimitOrder}
          hideToggle={!user}
        />
        <BuyPanel
          hidden={isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          onBuySuccess={onBetSuccess}
        />
        <LimitOrderPanel
          hidden={!isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          onBuySuccess={onBetSuccess}
        />

        <BetSignUpPrompt />

        {!user && <PlayMoneyDisclaimer />}
      </Col>

      {unfilledBets.length > 0 && (
        <LimitBets className="mt-4" contract={contract} bets={unfilledBets} />
      )}
    </Col>
  )
}

export function BuyPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  user: User | null | undefined
  unfilledBets: Bet[]
  hidden: boolean
  onBuySuccess?: () => void
  mobileView?: boolean
}) {
  const { contract, user, unfilledBets, hidden, onBuySuccess, mobileView } =
    props

  const initialProb = getProbability(contract)
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const windowSize = useWindowSize()
  const initialOutcome =
    windowSize.width && windowSize.width >= 1280 ? 'YES' : undefined
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(
    initialOutcome
  )
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  function onBetChoice(choice: 'YES' | 'NO') {
    setOutcome(choice)

    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }

  function mobileOnBetChoice(choice: 'YES' | 'NO' | undefined) {
    if (outcome === choice) {
      setOutcome(undefined)
    } else {
      setOutcome(choice)
    }
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
    if (!outcome) {
      setOutcome('YES')
    }
  }

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    placeBet({
      outcome,
      amount: betAmount,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
        else {
          toast('Trade submitted!', {
            icon: <CheckIcon className={'text-primary h-5 w-5'} />,
          })
        }
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    track('bet', {
      location: 'bet panel',
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount: betAmount,
      outcome,
      isLimitOrder: false,
    })
  }

  const betDisabled = isSubmitting || !betAmount || error

  const { newPool, newP, newBet } = getBinaryCpmmBetInfo(
    outcome ?? 'YES',
    betAmount ?? 0,
    contract,
    undefined,
    unfilledBets as LimitBet[]
  )

  const [seeLimit, setSeeLimit] = useState(false)
  const resultProb = getCpmmProbability(newPool, newP)
  const probStayedSame =
    formatPercent(resultProb) === formatPercent(initialProb)

  const probChange = Math.abs(resultProb - initialProb)
  const currentPayout = newBet.shares
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const format = getFormattedMappedValue(contract)

  const getValue = getMappedValue(contract)
  const rawDifference = Math.abs(getValue(resultProb) - getValue(initialProb))
  const displayedDifference = isPseudoNumeric
    ? formatLargeNumber(rawDifference)
    : formatPercent(rawDifference)

  const bankrollFraction = (betAmount ?? 0) / (user?.balance ?? 1e9)

  const warning =
    (betAmount ?? 0) >= 100 && bankrollFraction >= 0.5 && bankrollFraction <= 1
      ? `You might not want to spend ${formatPercent(
          bankrollFraction
        )} of your balance on a single trade. \n\nCurrent balance: ${formatMoney(
          user?.balance ?? 0
        )}`
      : (betAmount ?? 0) > 10 && probChange >= 0.3 && bankrollFraction <= 1
      ? `Are you sure you want to move the market by ${displayedDifference}?`
      : undefined

  return (
    <Col className={hidden ? 'hidden' : ''}>
      <YesNoSelector
        className="mb-4"
        btnClassName="flex-1"
        selected={outcome}
        onSelect={(choice) => {
          if (mobileView) {
            mobileOnBetChoice(choice)
          } else {
            onBetChoice(choice)
          }
        }}
        isPseudoNumeric={isPseudoNumeric}
      />

      <Col
        className={clsx(
          mobileView
            ? outcome === 'NO'
              ? 'bg-red-25'
              : outcome === 'YES'
              ? 'bg-teal-50'
              : 'hidden'
            : 'bg-white',
          mobileView ? 'rounded-lg px-4 py-2' : 'px-0'
        )}
      >
        <Row className="mt-3 w-full gap-3">
          <Col className="w-1/2 text-sm">
            <Col className="text-greyscale-4 flex-nowrap whitespace-nowrap text-xs">
              <div>
                {isPseudoNumeric ? (
                  'Max payout'
                ) : (
                  <>Payout if {outcome ?? 'YES'}</>
                )}
              </div>
            </Col>
            <div>
              <span className="whitespace-nowrap text-xl">
                {formatMoney(currentPayout)}
              </span>
              <span className="text-greyscale-4 text-xs">
                {' '}
                +{currentReturnPercent}
              </span>
            </div>
          </Col>
          <Col className="w-1/2 text-sm">
            <div className="text-greyscale-4 text-xs">
              {isPseudoNumeric ? 'Estimated value' : 'New Probability'}
            </div>
            {probStayedSame ? (
              <div className="text-xl">{format(initialProb)}</div>
            ) : (
              <div className="text-xl">
                {format(resultProb)}
                <span className={clsx('text-greyscale-4 text-xs')}>
                  {isPseudoNumeric ? (
                    <></>
                  ) : (
                    <>
                      {' '}
                      {outcome != 'NO' && '+'}
                      {format(resultProb - initialProb)}
                    </>
                  )}
                </span>
              </div>
            )}
          </Col>
        </Row>
        <Row className="text-greyscale-4 mt-4 mb-1 justify-between text-left text-xs">
          Amount
        </Row>

        <BuyAmountInput
          inputClassName="w-full max-w-none"
          amount={betAmount}
          onChange={onBetChange}
          error={error}
          setError={setError}
          disabled={isSubmitting}
          inputRef={inputRef}
          showSliderOnMobile
        />

        <Spacer h={8} />

        {user && (
          <WarningConfirmationButton
            marketType="binary"
            amount={betAmount}
            warning={warning}
            onSubmit={submitBet}
            isSubmitting={isSubmitting}
            disabled={!!betDisabled || outcome === undefined}
            size="xl"
            color={outcome === 'NO' ? 'red' : 'green'}
          />
        )}
        <button
          className="text-greyscale-6 mx-auto mt-3 select-none text-sm underline xl:hidden"
          onClick={() => setSeeLimit(true)}
        >
          Advanced
        </button>
        <Modal
          open={seeLimit}
          setOpen={setSeeLimit}
          position="center"
          className="rounded-lg bg-white px-4 pb-4"
        >
          <Title text="Limit Order" />
          <LimitOrderPanel
            hidden={!seeLimit}
            contract={contract}
            user={user}
            unfilledBets={unfilledBets}
          />
          <LimitBets
            contract={contract}
            bets={unfilledBets as LimitBet[]}
            className="mt-4"
          />
        </Modal>
      </Col>
    </Col>
  )
}

function LimitOrderPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  user: User | null | undefined
  unfilledBets: Bet[]
  hidden: boolean
  onBuySuccess?: () => void
}) {
  const { contract, user, unfilledBets, hidden, onBuySuccess } = props

  const initialProb = getProbability(contract)
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [lowLimitProb, setLowLimitProb] = useState<number | undefined>()
  const [highLimitProb, setHighLimitProb] = useState<number | undefined>()
  const betChoice = 'YES'
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const rangeError =
    lowLimitProb !== undefined &&
    highLimitProb !== undefined &&
    lowLimitProb >= highLimitProb

  const outOfRangeError =
    (lowLimitProb !== undefined &&
      (lowLimitProb <= 0 || lowLimitProb >= 100)) ||
    (highLimitProb !== undefined &&
      (highLimitProb <= 0 || highLimitProb >= 100))

  const hasYesLimitBet = lowLimitProb !== undefined && !!betAmount
  const hasNoLimitBet = highLimitProb !== undefined && !!betAmount
  const hasTwoBets = hasYesLimitBet && hasNoLimitBet

  const betDisabled =
    isSubmitting ||
    !betAmount ||
    rangeError ||
    outOfRangeError ||
    error ||
    (!hasYesLimitBet && !hasNoLimitBet)

  const yesLimitProb =
    lowLimitProb === undefined
      ? undefined
      : clamp(lowLimitProb / 100, 0.001, 0.999)
  const noLimitProb =
    highLimitProb === undefined
      ? undefined
      : clamp(highLimitProb / 100, 0.001, 0.999)

  const amount = betAmount ?? 0
  const shares =
    yesLimitProb !== undefined && noLimitProb !== undefined
      ? Math.min(amount / yesLimitProb, amount / (1 - noLimitProb))
      : yesLimitProb !== undefined
      ? amount / yesLimitProb
      : noLimitProb !== undefined
      ? amount / (1 - noLimitProb)
      : 0

  const yesAmount = shares * (yesLimitProb ?? 1)
  const noAmount = shares * (1 - (noLimitProb ?? 0))

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const betsPromise = hasTwoBets
      ? Promise.all([
          placeBet({
            outcome: 'YES',
            amount: yesAmount,
            limitProb: yesLimitProb,
            contractId: contract.id,
          }),
          placeBet({
            outcome: 'NO',
            amount: noAmount,
            limitProb: noLimitProb,
            contractId: contract.id,
          }),
        ])
      : placeBet({
          outcome: hasYesLimitBet ? 'YES' : 'NO',
          amount: betAmount,
          contractId: contract.id,
          limitProb: hasYesLimitBet ? yesLimitProb : noLimitProb,
        })

    betsPromise
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setBetAmount(undefined)
        setLowLimitProb(undefined)
        setHighLimitProb(undefined)
        if (onBuySuccess) onBuySuccess()
      })

    if (hasYesLimitBet) {
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount: yesAmount,
        outcome: 'YES',
        limitProb: yesLimitProb,
        isLimitOrder: true,
        isRangeOrder: hasTwoBets,
      })
    }
    if (hasNoLimitBet) {
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount: noAmount,
        outcome: 'NO',
        limitProb: noLimitProb,
        isLimitOrder: true,
        isRangeOrder: hasTwoBets,
      })
    }
  }

  const {
    currentPayout: yesPayout,
    currentReturn: yesReturn,
    totalFees: yesFees,
    newBet: yesBet,
  } = getBinaryBetStats(
    'YES',
    yesAmount,
    contract,
    yesLimitProb ?? initialProb,
    unfilledBets as LimitBet[]
  )
  const yesReturnPercent = formatPercent(yesReturn)

  const {
    currentPayout: noPayout,
    currentReturn: noReturn,
    totalFees: noFees,
    newBet: noBet,
  } = getBinaryBetStats(
    'NO',
    noAmount,
    contract,
    noLimitProb ?? initialProb,
    unfilledBets as LimitBet[]
  )
  const noReturnPercent = formatPercent(noReturn)

  const profitIfBothFilled = shares - (yesAmount + noAmount) - yesFees - noFees

  return (
    <Col className={hidden ? 'hidden' : ''}>
      <Row className="mt-1 items-center gap-4">
        <Col className="gap-2">
          <div className="relative ml-1 text-sm text-gray-500">
            Buy {isPseudoNumeric ? <HigherLabel /> : <YesLabel />} up to
          </div>
          <ProbabilityOrNumericInput
            contract={contract}
            prob={lowLimitProb}
            setProb={setLowLimitProb}
            isSubmitting={isSubmitting}
          />
        </Col>
        <Col className="gap-2">
          <div className="ml-1 text-sm text-gray-500">
            Buy {isPseudoNumeric ? <LowerLabel /> : <NoLabel />} down to
          </div>
          <ProbabilityOrNumericInput
            contract={contract}
            prob={highLimitProb}
            setProb={setHighLimitProb}
            isSubmitting={isSubmitting}
          />
        </Col>
      </Row>

      {outOfRangeError && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          Limit is out of range
        </div>
      )}
      {rangeError && !outOfRangeError && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          {isPseudoNumeric ? 'HIGHER' : 'YES'} limit must be less than{' '}
          {isPseudoNumeric ? 'LOWER' : 'NO'} limit
        </div>
      )}

      <Row className="mt-1 mb-3 justify-between text-left text-sm text-gray-500">
        <span>
          Max amount<span className="ml-1 text-red-500">*</span>
        </span>
        <span className={'xl:hidden'}>
          Balance: {formatMoney(user?.balance ?? 0)}
        </span>
      </Row>

      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        showSliderOnMobile
      />

      <Col className="mt-3 w-full gap-3">
        {(hasTwoBets || (hasYesLimitBet && yesBet.amount !== 0)) && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="whitespace-nowrap text-gray-500">
              {isPseudoNumeric ? (
                <HigherLabel />
              ) : (
                <BinaryOutcomeLabel outcome={'YES'} />
              )}{' '}
              filled now
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(yesBet.amount)} of{' '}
              {formatMoney(yesBet.orderAmount ?? 0)}
            </div>
          </Row>
        )}
        {(hasTwoBets || (hasNoLimitBet && noBet.amount !== 0)) && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="whitespace-nowrap text-gray-500">
              {isPseudoNumeric ? (
                <LowerLabel />
              ) : (
                <BinaryOutcomeLabel outcome={'NO'} />
              )}{' '}
              filled now
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(noBet.amount)} of{' '}
              {formatMoney(noBet.orderAmount ?? 0)}
            </div>
          </Row>
        )}
        {hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="whitespace-nowrap text-gray-500">
              Profit if both orders filled
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(profitIfBothFilled)}
            </div>
          </Row>
        )}
        {hasYesLimitBet && !hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
              <div>
                {isPseudoNumeric ? (
                  'Max payout'
                ) : (
                  <>
                    Max <BinaryOutcomeLabel outcome={'YES'} /> payout
                  </>
                )}
              </div>
              {/* <InfoTooltip
                text={`Includes ${formatMoneyWithDecimals(yesFees)} in fees`}
              /> */}
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                {formatMoney(yesPayout)}
              </span>
              (+{yesReturnPercent})
            </div>
          </Row>
        )}
        {hasNoLimitBet && !hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
              <div>
                {isPseudoNumeric ? (
                  'Max payout'
                ) : (
                  <>
                    Max <BinaryOutcomeLabel outcome={'NO'} /> payout
                  </>
                )}
              </div>
              {/* <InfoTooltip
                text={`Includes ${formatMoneyWithDecimals(noFees)} in fees`}
              /> */}
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                {formatMoney(noPayout)}
              </span>
              (+{noReturnPercent})
            </div>
          </Row>
        )}
      </Col>

      {(hasYesLimitBet || hasNoLimitBet) && <Spacer h={8} />}

      {user && (
        <button
          className={clsx(
            'btn flex-1',
            betDisabled
              ? 'btn-disabled'
              : betChoice === 'YES'
              ? 'btn-primary'
              : 'border-none bg-red-400 hover:bg-red-500',
            isSubmitting ? 'loading' : ''
          )}
          onClick={betDisabled ? undefined : submitBet}
        >
          {isSubmitting
            ? 'Submitting...'
            : `Submit order${hasTwoBets ? 's' : ''}`}
        </button>
      )}
    </Col>
  )
}

function QuickOrLimitBet(props: {
  isLimitOrder: boolean
  setIsLimitOrder: (isLimitOrder: boolean) => void
  hideToggle?: boolean
}) {
  const { isLimitOrder, setIsLimitOrder, hideToggle } = props

  return (
    <Row className="align-center mb-4 justify-between">
      <div className="mr-2 -ml-2 shrink-0 text-3xl sm:-ml-0">Predict</div>
      {!hideToggle && (
        <Row className="mt-1 ml-1 items-center gap-1.5 sm:ml-0 sm:gap-2">
          <PillButton
            selected={!isLimitOrder}
            onSelect={() => {
              setIsLimitOrder(false)
              track('select quick order')
            }}
            xs={true}
          >
            Quick
          </PillButton>
          <PillButton
            selected={isLimitOrder}
            onSelect={() => {
              setIsLimitOrder(true)
              track('select limit order')
            }}
            xs={true}
          >
            Limit
          </PillButton>
        </Row>
      )}
    </Row>
  )
}

export function SellPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  onSellSuccess?: () => void
}) {
  const { contract, shares, sharesOutcome, userBets, user, onSellSuccess } =
    props

  const [amount, setAmount] = useState<number | undefined>(shares)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const unfilledBets = useUnfilledBets(contract.id) ?? []

  const betDisabled = isSubmitting || !amount || error

  // Sell all shares if remaining shares would be < 1
  const isSellingAllShares = amount === Math.floor(shares)

  const sellQuantity = isSellingAllShares ? shares : amount

  async function submitSell() {
    if (!user || !amount) return

    setError(undefined)
    setIsSubmitting(true)

    await sellShares({
      shares: isSellingAllShares ? undefined : amount,
      outcome: sharesOutcome,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('Sold shares. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setAmount(undefined)
        if (onSellSuccess) onSellSuccess()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error selling')
        }
        setIsSubmitting(false)
      })

    track('sell shares', {
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      shares: sellQuantity,
      outcome: sharesOutcome,
    })
  }

  const initialProb = getProbability(contract)
  const { cpmmState, saleValue } = calculateCpmmSale(
    contract,
    sellQuantity ?? 0,
    sharesOutcome,
    unfilledBets
  )
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const openUserBets = userBets.filter((bet) => !bet.isSold && !bet.sale)
  const [yesBets, noBets] = partition(
    openUserBets,
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    sumBy(yesBets, (bet) => bet.shares),
    sumBy(noBets, (bet) => bet.shares),
  ]

  const ownedShares = Math.round(yesShares) || Math.round(noShares)

  const onAmountChange = (amount: number | undefined) => {
    setAmount(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (amount > ownedShares) {
        setError(`Maximum ${formatWithCommas(Math.floor(ownedShares))} shares`)
      } else {
        setError(undefined)
      }
    }
  }

  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const format = getFormattedMappedValue(contract)

  return (
    <>
      <AmountInput
        amount={
          amount ? (Math.round(amount) === 0 ? 0 : Math.floor(amount)) : 0
        }
        onChange={onAmountChange}
        label="Qty"
        error={error}
        disabled={isSubmitting}
        inputClassName="w-full"
      />

      <Col className="mt-3 w-full gap-3 text-sm">
        <Row className="items-center justify-between gap-2 text-gray-500">
          Sale proceeds
          <span className="text-neutral">{formatMoney(saleValue)}</span>
        </Row>
        <Row className="items-center justify-between">
          <div className="text-gray-500">
            {isPseudoNumeric ? 'Estimated value' : 'Probability'}
          </div>
          <div>
            {format(initialProb)}
            <span className="mx-2">→</span>
            {format(resultProb)}
          </div>
        </Row>
      </Col>

      <Spacer h={8} />

      <button
        className={clsx(
          'btn flex-1',
          betDisabled
            ? 'btn-disabled'
            : sharesOutcome === 'YES'
            ? 'btn-primary'
            : 'border-none bg-red-400 hover:bg-red-500',
          isSubmitting ? 'loading' : ''
        )}
        onClick={betDisabled ? undefined : submitSell}
      >
        {isSubmitting ? 'Submitting...' : 'Submit sell'}
      </button>

      {wasSubmitted && <div className="mt-4">Sell submitted!</div>}
    </>
  )
}
