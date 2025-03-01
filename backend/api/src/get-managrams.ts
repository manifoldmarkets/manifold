import { type APIHandler } from './helpers/endpoint'
import { getTxnsMain } from './get-txns'
import { ManaPayTxn } from 'common/txn'

export const getManagrams: APIHandler<'managrams'> = async (props) => {
  const txns = await getTxnsMain({
    ...props,
    offset: 0,
    category: 'MANA_PAYMENT',
  })

  return txns as ManaPayTxn[]
}
