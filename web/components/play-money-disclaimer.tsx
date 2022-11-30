import { ENV_CONFIG } from 'common/envs/constants'
import { InfoBox } from './widgets/info-box'

export const PlayMoneyDisclaimer = () => (
  <InfoBox
    title={`Mana (${ENV_CONFIG.moneyMoniker}) is play money`}
    className="mt-4"
    text={`Manifold Markets tracks your predictions in mana, not real cash. Sign up for free!`}
  />
)
