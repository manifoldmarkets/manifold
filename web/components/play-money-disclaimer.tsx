import { ENV_CONFIG } from 'common/envs/constants'
import { InfoBox } from './widgets/info-box'

export const PlayMoneyDisclaimer = () => (
  <InfoBox
    title={`Play-money predictions`}
    className="mt-4"
    text={`Manifold Markets lets you predict on any question using mana (${ENV_CONFIG.moneyMoniker}),
     our play-money currency. Sign up for free!`}
  />
)
