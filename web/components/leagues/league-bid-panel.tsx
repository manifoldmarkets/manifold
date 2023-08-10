import { bidForLeague } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { useEffect, useState } from 'react'
import { AmountInput } from '../widgets/amount-input'

export const LeagueBidPanel = (props: {
  season: number
  division: number
  cohort: string
  minAmount: number
}) => {
  const { season, division, cohort, minAmount } = props
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amount, setAmount] = useState<number | undefined>(minAmount)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    setAmount(minAmount)
  }, [minAmount])

  const submitBid = async () => {
    if (isSubmitting || !amount) {
      return
    }
    setIsSubmitting(true)
    const response = await bidForLeague({
      season,
      division,
      cohort,
      amount,
    }).catch((e) => {
      console.error(e)
      setError(e.message)
      return { error: e }
    })
    if (!response.error) {
      setError(undefined)
    }
    console.log('response', response)
    setIsSubmitting(false)
  }
  return (
    <Col className="gap-2 border px-3 py-2">
      <Row className="items-center gap-2">
        <div className="text-ink-600 text-sm">
          Bid to own this league for the season{' '}
          <InfoTooltip
            text={
              'At the end of the season, the owner of the league will gain mana equal to the total mana earned of every user in the league.'
            }
          />
        </div>
      </Row>
      <Row className="items-center gap-2">
        <Col>
          <AmountInput
            inputClassName="w-[150px]"
            amount={amount}
            onChangeAmount={setAmount}
            error={error}
          />
          <div className="text-sm text-red-500">{error}</div>
        </Col>

        <Button
          color="indigo"
          size="sm"
          onClick={submitBid}
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          Place bid
        </Button>
      </Row>
    </Col>
  )
}
