import { createHash } from 'crypto'

const md5 = (value: string) =>
  createHash('md5').update(value, 'utf8').digest('hex')

// Protocol agreed with MNX: both MD5 results are lowercase hex strings.
// Only the derived shared key is given to MNX; neither key goes to the browser.
export const getMnxInvite = (username: string, apiSecret: string) => {
  if (!apiSecret) throw new Error('MNX invites require API_SECRET')
  const sharedKey = md5('mnx' + apiSecret)
  return { username, token: md5(username + sharedKey) }
}
