import { newEndpoint } from 'functions/src/api'
import * as admin from 'firebase-admin'
import { log } from './utils'

export const gettoken = newEndpoint({}, async (req, auth) => {
  // const firestore = admin.firestore()
  const adminAuth = admin.auth()
  const token = await adminAuth.createCustomToken(
    '6hHpzvRG0pMq8PNJs7RZj2qlZGn2'
  )
  log(token)
  return { status: 'success', token }
})
