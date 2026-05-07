export const MEXAS_TOKEN = {
  name: 'MEXAS Stablecoin',
  symbol: 'MEX',
  decimals: 6,
  chainId: 42161,
  chainName: 'Arbitrum One',
  address: '0xc4c2ede4f6fd623acc86c492bdf099b3ba2b8303',
  arbiscanUrl:
    'https://arbiscan.io/token/0xc4c2ede4f6fd623acc86c492bdf099b3ba2b8303',
} as const

export const MEXAS_PUBLIC_RPC_URL = 'https://arb1.arbitrum.io/rpc'
export const MEXAS_MANA_PER_TOKEN = 100

export function getMexasPurchaseMessage(
  userId: string,
  txHash: string,
  payerAddress: string
) {
  return [
    'Authorize MEXAS purchase credit on Manifold.',
    `User ID: ${userId}`,
    `Transaction: ${txHash.toLowerCase()}`,
    `Wallet: ${payerAddress.toLowerCase()}`,
    `Chain: ${MEXAS_TOKEN.chainName} (${MEXAS_TOKEN.chainId})`,
    `Token: ${MEXAS_TOKEN.address.toLowerCase()}`,
  ].join('\n')
}
