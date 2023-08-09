import { toLabel } from 'common/util/adjective-animal'
import { formatMoney } from 'common/util/format'
import { bidForLeague } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { useState } from 'react'

export const LeagueBidPanel = (props: {
  season: number
  division: number
  cohort: string
  amount: number
}) => {
  const { season, division, cohort, amount } = props
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submitBid = async () => {
    if (isSubmitting) {
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
    })
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
          <div className="text-ink-600 text-sm">Price</div>
          <div>{formatMoney(amount)}</div>
        </Col>

        <Button
          color="indigo"
          size="sm"
          onClick={submitBid}
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          Place bid for {toLabel(cohort)}
        </Button>
      </Row>
    </Col>
  )
}
