import { APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/utils'

export const callbackGIDX: APIHandler<'callback-gidx'> = async (props) => {
  log('callback-gidx', props)
  return { success: true }
}

const documentStatus = {
  1: 'Not Reviewed',
  2: 'Under Review',
  3: 'Review Complete',
}
