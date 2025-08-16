import { SoundtrackPlayer } from 'web/components/soundtrack/soundtrack-player'
import SoundRecorder from 'web/components/soundtrack/sound-recorder'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
export default function Soundtrack() {
  return (
    <Col className={'p-4'}>
      <Row className={'justify-between'}>
        <span>Welcome to the temple of gambling</span>
        <SoundtrackPlayer />
      </Row>
      <SoundRecorder />
    </Col>
  )
}
