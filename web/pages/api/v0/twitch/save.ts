import { nextHandler } from 'web/lib/api/handler'

export const config = { api: { bodyParser: true } }

const handler = nextHandler('save-twitch')
export default handler
