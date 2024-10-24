import { APIHandler } from './helpers/endpoint'

export const health: APIHandler<'health'> = async (_, auth) => ({
  message: 'Server is working.',
  uid: auth.uid,
})
