import { sign } from 'jsonwebtoken'
import { authEndpoint, APIError } from './helpers'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { getInstanceHostname } from 'common/supabase/utils'
import { isProd } from 'shared/utils'

export const getsupabasetoken = authEndpoint(async (_req, auth) => {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (jwtSecret == null) {
    throw new APIError(500, "No SUPABASE_JWT_SECRET; couldn't sign token.")
  }
  const instanceId = isProd()
    ? PROD_CONFIG.supabaseInstanceId
    : DEV_CONFIG.supabaseInstanceId
  if (!instanceId) {
    throw new APIError(500, 'No Supabase instance ID in config.')
  }
  return {
    jwt: sign({}, jwtSecret, {
      algorithm: 'HS256', // same as what supabase uses for its auth tokens
      expiresIn: '1d',
      audience: `db.${getInstanceHostname(instanceId)}`,
      issuer: isProd()
        ? PROD_CONFIG.firebaseConfig.projectId
        : DEV_CONFIG.firebaseConfig.projectId,
      subject: auth.uid,
    }),
  }
})
