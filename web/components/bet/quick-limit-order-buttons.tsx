import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useState } from 'react'

import { APIError } from 'common/api/utils'
import { CPMMContract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { DAY_MS } from 'common/util/time'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { track } from 'web/lib/service/analytics'

export const QuickLimitOrderButtons = (props: {
  contract: CPMMContract // | CPMMMultiContract
  className?: string
}) => {
  const { contract, className } = props
  const prob = Math.round(contract.prob * 100) / 100
  const amount = 1_000

  const user = useUser()
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES')

  async function submitBet(outcome: 'YES' | 'NO') {
    if (!user) return

    setError(undefined)
    setIsSubmitting(true)
    setOutcome(outcome)

    // const answerId = multiProps?.answerToBuy.id
    const expiresAt = Date.now() + DAY_MS

    await api(
      'bet',
      removeUndefinedProps({
        outcome,
        amount,
        contractId: contract.id,
        limitProb: prob,
        expiresAt,
        // answerId,
      })
    )
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        toast.success(
          `Placed order for ${formatMoney(
            amount
          )} ${outcome} at ${formatPercent(prob)}`
        )
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.message.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    await track('bet', {
      location: 'quick bet panel',
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount,
      outcome,
      limitProb: prob,
      isLimitOrder: true,
      // answerId: multiProps?.answerToBuy.id,
    })
  }

  return (
    <Col
      className={clsx(className, 'border-ink-200 my-2 gap-2 rounded-lg py-2')}
    >
      <Row className="items-center gap-2">
        <div className="text-ink-600">
          Quick limit order{' '}
          <InfoTooltip
            text={`Offer to buy ${formatMoney(
              amount
            )} YES or NO at the current market price of ${formatPercent(
              prob
            )}. If no one takes your bet, your offer will expire in 24 hours.`}
          />
        </div>
        <Button
          size="xs"
          color="gray-outline"
          loading={outcome === 'YES' && isSubmitting}
          className="w-24 whitespace-nowrap font-semibold"
          onClick={() => submitBet('YES')}
        >
          {formatMoney(amount / 1000)}k YES
        </Button>
        <Button
          size="xs"
          color="gray-outline"
          loading={outcome === 'NO' && isSubmitting}
          className="w-24 whitespace-nowrap font-semibold"
          onClick={() => submitBet('NO')}
        >
          {formatMoney(amount / 1000)}k NO
        </Button>
      </Row>
      {error && <div className="text-red-500">{error}</div>}
    </Col>
  )
}
