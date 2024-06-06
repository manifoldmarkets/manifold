import { BetsSoundtrack } from 'web/components/soundtrack/bets-soundtrack'
import SoundRecorder from 'web/components/soundtrack/sound-recorder'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
export default function Soundtrack() {
  return (
    <Col>
      <Row className={'justify-between'}>
        <span>Welcome to the temple of gambling</span>
        <BetsSoundtrack />
      </Row>
      <SoundRecorder />
    </Col>
  )
}
