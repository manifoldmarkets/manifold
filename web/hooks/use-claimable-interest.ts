import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

export type ClaimableInterest = {
  yesShares: number
  noShares: number
  yesShareDays: number
  noShareDays: number
}

export function useClaimableInterest(
  contractId: string,
  userId: string | undefined,
  answerId?: string
) {
  const [interest, setInterest] = useState<ClaimableInterest | null>(null)
  const [loading, setLoading] = useState(false)

  const refetch = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const result = await api('get-claimable-interest', { contractId, answerId })
      setInterest(result)
    } catch (error) {
      console.error('Failed to fetch claimable interest:', error)
      setInterest(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetch()
  }, [contractId, userId, answerId])

  const hasClaimableInterest =
    (interest?.yesShares ?? 0) > 0 || (interest?.noShares ?? 0) > 0

  return { interest, loading, hasClaimableInterest, refetch }
}
