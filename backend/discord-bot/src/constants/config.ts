import { DEV } from './dev.js'
import { PROD } from './prod.js'
import { CONFIGS } from 'common/envs/constants'
const commonConfig = CONFIGS[process.env.ENVIRONMENT ?? 'DEV']
const discordConfig = process.env.ENVIRONMENT === 'PROD' ? PROD : DEV
export const config = { ...discordConfig, ...commonConfig }
