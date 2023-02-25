import { DEV } from './dev.js'
import { PROD } from './prod.js'
export const config = process.env.ENVIRONMENT === 'PROD' ? PROD : DEV
