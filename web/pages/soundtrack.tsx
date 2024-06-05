import { BetsSoundtrack } from 'web/components/soundtrack/bets-soundtrack'
import SoundRecorder from 'web/components/soundtrack/sound-recorder'
import { Row } from 'web/components/layout/row'
export default function Soundtrack() {
  return (
    <div>
      <Row className={'justify-between'}>
        <h1>Welcome, pilgrim</h1>
        <BetsSoundtrack />
      </Row>
      <SoundRecorder />
    </div>
  )
}
