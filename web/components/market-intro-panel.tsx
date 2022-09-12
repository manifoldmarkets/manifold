import Image from 'next/future/image'

import { Col } from './layout/col'
import { BetSignUpPrompt } from './sign-up-prompt'

export function MarketIntroPanel() {
  return (
    <Col>
      <div className="text-xl">Play-money predictions</div>

      <Image
        height={150}
        width={150}
        className="self-center"
        src="/flappy-logo.gif"
      />

      <div className="text-sm mb-4">
        Manifold Markets is a play-money prediction market platform where you can
        forecast anything.
      </div>

      <BetSignUpPrompt />
    </Col>
  )
}
