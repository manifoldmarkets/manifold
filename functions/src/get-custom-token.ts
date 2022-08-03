import * as admin from 'firebase-admin'
import {
  APIError,
  EndpointDefinition,
  lookupUser,
  parseCredentials,
  writeResponseError,
} from './api'

const opts = { method: 'GET', minInstances: 1 }

export const getcustomtoken: EndpointDefinition = {
  opts,
  handler: async (req, res) => {
    try {
      const credentials = await parseCredentials(req)
      if (credentials.kind != 'jwt') {
        throw new APIError(403, 'API keys cannot mint custom tokens.')
      }
      const user = await lookupUser(credentials)
      const token = await admin.auth().createCustomToken(user.uid)
      res.status(200).json({ token: token })
    } catch (e) {
      writeResponseError(e, res)
    }
  },
}
