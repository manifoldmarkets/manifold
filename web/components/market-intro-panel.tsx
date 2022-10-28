import Image from 'next/image'

import { Col } from './layout/col'
import { BetSignUpPrompt } from './sign-up-prompt'

export function MarketIntroPanel() {
  return (
    <Col>
      <div className="text-xl">Play-money predictions</div>

      <Image
        height={125}
        width={125}
        className="my-4 self-center"
        src="/welcome/manipurple.png"
        alt="Manifold Markets gradient logo"
      />

      <div className="mb-4 text-sm">
        Manifold Markets is a play-money prediction market platform where you
        can forecast anything.
      </div>

      <BetSignUpPrompt />
    </Col>
  )
}
