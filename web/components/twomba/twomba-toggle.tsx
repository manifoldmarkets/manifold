import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { Row } from '../layout/row'
import { ManaCoin } from 'web/public/custom-components/manaCoin'

export type TWOMBA_MODE_TYPE = 'sweepies' | 'mana'

export function TwombaToggle(props: {
  mode: TWOMBA_MODE_TYPE
  onClick: () => void
}) {
  return (
    <Row className="bg-canvas-0 h-8 rounded-full">
      <SweepiesCoin />
      <ManaCoin />
    </Row>
  )
}
