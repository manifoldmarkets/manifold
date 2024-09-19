import { TWOMBA_ENABLED } from 'common/envs/constants'

type AboutManifoldProps = {
  className?: string
}

export const AboutManifold = ({ className = '' }: AboutManifoldProps) => {
  return (
    <div className={`${className}`}>
      <div className="mb-2">
        Manifold is the world's largest social prediction market.
      </div>
      <div className="mb-2">
        Get accurate real-time odds on politics, tech, sports, and more.
      </div>
      {TWOMBA_ENABLED ? (
        <div className="mb-2">
          Win cash prizes for your predictions on our sweepstakes markets!
          Always free to play. No purchase necessary.
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
