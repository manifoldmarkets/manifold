import { Contract, isBinaryMulti, MarketContract } from 'common/contract'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { BetAmountInput } from './bet-input'
import { Row } from 'components/layout/row'
import { YesNoButton } from 'components/buttons/yes-no-buttons'
import { Button } from 'components/buttons/button'
import { api } from 'lib/api'
import { Modal } from 'components/layout/modal'
import { TokenNumber } from 'components/token/token-number'
import { NumberText } from 'components/number-text'
import { usePrivateUser, useUser } from 'hooks/use-user'
import Slider from '@react-native-community/slider'
import { useTokenMode } from 'hooks/use-token-mode'
import {
  KYC_VERIFICATION_BONUS_CASH,
  MANA_MIN_BET,
  SWEEPS_MIN_BET,
} from 'common/economy'
import {
  formatMoneyNumber,
  formatPercent,
  formatWithToken,
} from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import {
  getVerificationStatus,
  PROMPT_USER_VERIFICATION_MESSAGES,
} from 'common/gidx/user'
import { router } from 'expo-router'
import { SWEEPIES_NAME } from 'common/envs/constants'
import { LimitBet } from 'common/bet'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import {
  useContractBets,
  useUnfilledBetsAndBalanceByUserId,
} from 'client-common/hooks/use-bets'
import { CandidateBet } from 'common/new-bet'
import { useToast } from 'react-native-toast-notifications'
import { getLimitBetReturns, MultiBetProps } from 'client-common/lib/bet'
export type BinaryOutcomes = 'YES' | 'NO'

const AMOUNT_STEPS = [1, 2, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100]

export function BetPanel({
  contract,
  open,
  setOpen,
  outcome,
  multiProps,
}: {
  contract: MarketContract
  open: boolean
  setOpen: (open: boolean) => void
  outcome: BinaryOutcomes
  multiProps?: MultiBetProps
}) {
  // TODO: figure out keyboard clicking behavior
  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} showHeader>
      <BetPanelContent
        contract={contract}
        outcome={outcome}
        multiProps={multiProps}
        setOpen={setOpen}
      />
    </Modal>
  )
}

export function BetPanelContent({
  contract,
  outcome,
  multiProps,
  setOpen,
}: {
  contract: Contract
  outcome: BinaryOutcomes
  multiProps?: MultiBetProps
  setOpen: (open: boolean) => void
}) {
  const color = useColor()
  const [amount, setAmount] = useState(1)
  const { token } = useTokenMode()
  const toast = useToast()

  const answer = multiProps?.answerToBuy
    ? multiProps.answers.find((a) => a.id === multiProps.answerToBuy.id)
    : null

  const isBinaryMC = isBinaryMulti(contract)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedBet, setSubmittedBet] = useState<
    | (LimitBet & {
        expired: boolean
        toastId: string
      })
    | null
  >(null)

  const isCashContract = contract.token === 'CASH'
  const user = useUser()
  const privateUser = usePrivateUser()

  const limitBets = useContractBets(
    contract.id,
    removeUndefinedProps({
      userId: user?.id,
      enabled: !!user?.id,
      afterTime: contract?.lastBetTime ?? user?.lastBetTime,
    }),
    useIsPageVisible,
    (params) => api('bets', params)
  )
  const updatedBet = limitBets.find((b) => b.id === submittedBet?.id)
  useEffect(() => {
    if (!submittedBet) return
    if (
      updatedBet?.isFilled ||
      updatedBet?.isCancelled ||
      submittedBet.expired ||
      (updatedBet?.expiresAt && Date.now() > updatedBet.expiresAt)
    ) {
      const amountFilled = updatedBet?.amount ?? submittedBet.amount
      const sharesFilled = updatedBet?.shares ?? submittedBet.shares
      const orderAmount = updatedBet?.orderAmount ?? submittedBet.orderAmount
      const message = `${formatWithToken({
        amount: amountFilled,
        token: isCashContract ? 'CASH' : 'M$',
      })}/${formatWithToken({
        amount: orderAmount,
        token: isCashContract ? 'CASH' : 'M$',
      })} filled for ${formatWithToken({
        amount: sharesFilled,
        token: isCashContract ? 'CASH' : 'M$',
      })} on payout`

      toast.update(submittedBet.toastId, message)
      setSubmittedBet(null)
    }
  }, [updatedBet, submittedBet])
  const NEEDS_TO_REGISTER =
    'You need to register to participate in this contest'
  // Check for errors.
  useEffect(() => {
    if (!user || !privateUser) return
    if (token === 'CASH') {
      const { status, message } = getVerificationStatus(user, privateUser)
      if (PROMPT_USER_VERIFICATION_MESSAGES.includes(message)) {
        setError(NEEDS_TO_REGISTER)
        return
      } else if (status === 'error') {
        setError(message)
        return
      }
    }
    if (
      user &&
      ((token === 'MANA' &&
        (user.balance < (amount ?? 0) || user.balance < MANA_MIN_BET)) ||
        (token === 'CASH' &&
          (user.cashBalance < (amount ?? 0) ||
            user.cashBalance < SWEEPS_MIN_BET)))
    ) {
      setError('Insufficient balance')
    } else if (amount !== undefined) {
      if (token === 'CASH' && amount < SWEEPS_MIN_BET) {
        setError(
          'Minimum amount: ' + formatMoneyNumber(SWEEPS_MIN_BET) + ' Sweeps'
        )
      } else if (token === 'MANA' && amount < MANA_MIN_BET) {
        setError('Minimum amount: ' + formatMoneyNumber(MANA_MIN_BET) + ' Mana')
      } else {
        setError(null)
      }
    } else {
      setError(null)
    }
  }, [amount, user, token])
  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id,
    (params) => api('bets', params),
    (params) => api('users/by-id/balance', params),
    useIsPageVisible
  )
  const { currentPayout, betDeps, limitProb } = getLimitBetReturns(
    outcome,
    amount,
    unfilledBets,
    balanceByUserId,
    setError,
    contract,
    multiProps
  )

  const onPress = async () => {
    if (!user) return
    let toastId: string
    try {
      const expiresMillisAfter = 1000
      setLoading(true)
      const bet = await api(
        'bet',
        removeUndefinedProps({
          contractId: contract.id,
          outcome,
          amount,
          answerId: multiProps?.answerToBuy?.id,
          expiresMillisAfter,
          limitProb,
          deps: betDeps.map((b) => b.id),
        })
      )
      if (bet.isFilled) {
        setSubmittedBet(null)
        setOpen(false)
        toastId = toast.show(
          `${formatWithToken({
            amount: bet.amount,
            token: isCashContract ? 'CASH' : 'M$',
          })}/${formatWithToken({
            amount: bet.orderAmount ?? 0,
            token: isCashContract ? 'CASH' : 'M$',
          })} filled for ${formatWithToken({
            amount: bet.shares,
            token: isCashContract ? 'CASH' : 'M$',
          })} on payout`
        )
      } else {
        toastId = toast.show('Filling orders...')
        setSubmittedBet({
          ...(bet as CandidateBet<LimitBet>),
          userId: user.id,
          id: bet.betId,
          expired: false,
          toastId,
        })
        setTimeout(() => {
          setSubmittedBet((prev) => (prev ? { ...prev, expired: true } : null))
        }, expiresMillisAfter + 100)
      }
    } catch (error: any) {
      console.error(error)
      toastId = toast.show('Failed to place trade: ' + (error.message ?? ''))
      setOpen(false)
    }
    setLoading(false)
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 108 : 0}
      style={{
        flex: 1,
        justifyContent: 'flex-start',
        flexDirection: 'column',
        paddingBottom: 16,
      }}
    >
      <Col style={{ flex: 1, justifyContent: 'space-between' }}>
        <Col style={{ gap: 4 }}>
          <ThemedText size="lg" weight="semibold">
            {contract.question}
          </ThemedText>

          <ThemedText size="md" color={color.textSecondary}>
            {!!answer && !isBinaryMC && answer.text}
          </ThemedText>
        </Col>
        <Col style={{ gap: 12 }}>
          <BetAmountInput amount={amount} setAmount={setAmount} />
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={AMOUNT_STEPS[0]}
            maximumValue={AMOUNT_STEPS[AMOUNT_STEPS.length - 1]}
            value={amount}
            onValueChange={(value) => {
              const closestStep = AMOUNT_STEPS.reduce((prev, curr) =>
                Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
              )
              setAmount(closestStep)
            }}
            minimumTrackTintColor={color.primaryButton}
            maximumTrackTintColor={color.border}
            thumbTintColor={color.primary}
          />
          {error &&
            (error === NEEDS_TO_REGISTER ? (
              <Col style={{ gap: 8 }}>
                <ThemedText color={color.error}>{error}</ThemedText>
                <Button
                  onPress={() => router.push(`/register?slug=${contract.slug}`)}
                >
                  Register and get {KYC_VERIFICATION_BONUS_CASH} {SWEEPIES_NAME}{' '}
                  free!
                </Button>
              </Col>
            ) : (
              <ThemedText color={color.error}>{error}</ThemedText>
            ))}
        </Col>
        <Col style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between', width: '100%' }}>
            <ThemedText color={color.textTertiary} size="lg">
              Payout if win
            </ThemedText>

            {/* TODO: get real payout */}
            <Row style={{ alignItems: 'center', gap: 4 }}>
              <TokenNumber amount={currentPayout} size="lg" />
              <NumberText size="lg" color={color.profitText}>
                (+{formatPercent(currentPayout / amount)})
              </NumberText>
            </Row>
          </Row>
          {isBinaryMC ? (
            <Button
              size="lg"
              onPress={onPress}
              disabled={loading || error !== null}
              loading={loading}
            >
              <ThemedText weight="normal">
                Buy{' '}
                <ThemedText weight="semibold">
                  {multiProps?.answerText ?? multiProps?.answerToBuy?.text}
                </ThemedText>
              </ThemedText>
            </Button>
          ) : (
            <YesNoButton
              disabled={loading || error !== null}
              loading={loading}
              variant={outcome === 'YES' ? 'yes' : 'no'}
              size="lg"
              title={`Buy ${outcome === 'YES' ? 'Yes' : 'No'}`}
              onPress={onPress}
            />
          )}
        </Col>
      </Col>
    </KeyboardAvoidingView>
  )
}
