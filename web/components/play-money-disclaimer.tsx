import { CoinNumber } from './widgets/coin-number'
import { Row } from './layout/row'

export const PlayMoneyDisclaimer = (props: { text?: string }) => {
  const { text } = props
  return (
    <Row className="text-ink-500 my-1.5 justify-center text-sm">
      Get
      <CoinNumber amount={1000} coinType="mana" className="mx-1" />
      and
      <CoinNumber amount={1} coinType="sweepies" className="ml-1" />
    </Row>
  )
}
