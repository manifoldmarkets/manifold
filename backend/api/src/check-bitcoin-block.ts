import { APIHandler } from 'api/helpers/endpoint'
import { checkBlockAfter } from 'common/bitcoin'

export const checkBitcoinBlock: APIHandler<'check-bitcoin-block'> = async (
  props
) => {
  const { closeTime } = props

  // Convert milliseconds to seconds for the Bitcoin API
  const closeTimeSeconds = Math.floor(closeTime / 1000)

  const block = await checkBlockAfter(closeTimeSeconds)

  if (!block) {
    return {
      available: false,
    }
  }

  return {
    available: true,
    blockHeight: block.height,
    blockHash: block.id,
    blockTimestamp: block.timestamp,
  }
}
