import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'

export const AboutManifold = ({ className = '' }) => {
  return (
    <div className={`${className}`}>
      <div className="mb-2">
        Manifold is a social prediction market to follow the news with real-time
        odds.
      </div>
      <div className="mb-2">
        Participate in sweepstakes markets to win real money!{' '}
      </div>
      <div>
        Or, {TRADE_TERM} with mana on our play-money markets to improve your
        skills and compete in leagues.
      </div>
    </div>
  )
}
