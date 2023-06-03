import { ENV_CONFIG } from 'common/envs/constants'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'

export default function ChallengePage() {
  return (
    <Page>
      <div className="my-8 px-4">
        Challenge bets are no longer supported.
        <br />
        But I'm sure this one was great! Or perhaps expired.
      </div>
      <FAQ />
    </Page>
  )
}

function FAQ() {
  const [toggleWhatIsThis, setToggleWhatIsThis] = useState(false)
  const [toggleWhatIsMana, setToggleWhatIsMana] = useState(false)
  return (
    <Col className={'items-center gap-4 p-2 md:p-6 lg:items-start'}>
      <Row className={'text-primary-700 text-xl'}>FAQ</Row>
      <Row className={'text-primary-700 text-lg'}>
        <span
          className={'mx-2 cursor-pointer'}
          onClick={() => setToggleWhatIsThis(!toggleWhatIsThis)}
        >
          {toggleWhatIsThis ? '-' : '+'}
          What is this?
        </span>
      </Row>
      {toggleWhatIsThis && (
        <Row className={'mx-4'}>
          <span>
            This was a challenge bet, or a bet offered from one person to
            another that is only realized if both parties agree.
          </span>
        </Row>
      )}
      <Row className={'text-primary-700 text-lg'}>
        <span
          className={'mx-2 cursor-pointer'}
          onClick={() => setToggleWhatIsMana(!toggleWhatIsMana)}
        >
          {toggleWhatIsMana ? '-' : '+'}
          What is {ENV_CONFIG.moneyMoniker}?
        </span>
      </Row>
      {toggleWhatIsMana && (
        <Row className={'mx-4'}>
          Mana ({ENV_CONFIG.moneyMoniker}) is the play-money used by our
          platform to keep track of your bets. It's completely free to get
          started, and you can donate your winnings to charity!
        </Row>
      )}
    </Col>
  )
}
