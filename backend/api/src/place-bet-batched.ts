import { APIError, type APIHandler } from './helpers/endpoint'
import { placeBetMain } from './place-bet'

export const placeBetBatched: APIHandler<'bet-batched'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  
  try {
    const result = await placeBetMain(props, auth.uid, isApi)
    return result
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw new APIError(500, 'An unexpected error occurred while placing the bet')
  }
}
