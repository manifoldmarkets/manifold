import { MEXAS_PUBLIC_RPC_URL, MEXAS_TOKEN } from 'common/crypto/mexas'
import {
  createPublicClient,
  formatUnits,
  http,
  type Address,
  type Hex,
} from 'viem'
import { arbitrum } from 'viem/chains'

export const mexasErc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const mexasPublicClient = createPublicClient({
  chain: arbitrum,
  transport: http(
    process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL ?? MEXAS_PUBLIC_RPC_URL
  ),
})

export async function getMexasBalanceUnits(address: Address) {
  return mexasPublicClient.readContract({
    address: MEXAS_TOKEN.address as Address,
    abi: mexasErc20Abi,
    functionName: 'balanceOf',
    args: [address],
  })
}

export function formatMexasUnits(units: bigint) {
  return formatUnits(units, MEXAS_TOKEN.decimals)
}

export function getArbiscanTxUrl(hash: Hex) {
  return `https://arbiscan.io/tx/${hash}`
}
