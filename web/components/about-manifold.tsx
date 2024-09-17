import { TRADE_TERM, TWOMBA_ENABLED } from 'common/envs/constants'
import { capitalize } from 'lodash'

export const AboutManifold = ({ className = '' }) => {
  return (
    <div className={`${className}`}>
      <div className="mb-2">
        Manifold is a social prediction market with real-time odds on wide
        ranging news such as politics, tech, sports and more!
      </div>
      {TWOMBA_ENABLED ? (
        <div className="mb-2">
          Participate for free in sweepstakes markets to win sweepcash which can
          be withdrawn for real money!{' '}
        </div>
      ) : (
        <div className="mb-2">
          Bet against others on our play money markets to progress up the
          leaderboards and contribute to the market's probability!
        </div>
      )}
    </div>
  )
}
