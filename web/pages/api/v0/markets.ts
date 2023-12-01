import { nextHandler } from 'web/lib/api/handler'

export const config = { api: { bodyParser: false } }

const handler = nextHandler('markets')
export default handler
