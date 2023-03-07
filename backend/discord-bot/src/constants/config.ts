import { DEV } from './dev.js'
import { PROD } from './prod.js'
import { CONFIGS } from 'common/envs/constants'
const ENV = process.env.ENVIRONMENT ?? 'DEV'
const commonConfig = CONFIGS[ENV]
const discordConfig = (ENV === 'PROD' ? PROD : DEV) as {
  clientId: string
  domain: string
  guildId?: string
  ignoreGuildIds?: string[]
}
if (ENV === 'PROD') {
  // Add guild ids to ignore here if people want to test the bot on their server
  discordConfig.ignoreGuildIds = [DEV.guildId]
}
export const config = { ...commonConfig, ...discordConfig }
