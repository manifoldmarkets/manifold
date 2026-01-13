import { UserEntitlement } from 'common/shop/types'
import { createContext, useContext, useState, useCallback, useMemo } from 'react'

type OptimisticEntitlementsContextType = {
  optimisticEntitlements: UserEntitlement[]
  setOptimisticEntitlement: (entitlement: UserEntitlement) => void
  clearOptimisticEntitlements: () => void
}

const OptimisticEntitlementsContext =
  createContext<OptimisticEntitlementsContextType | null>(null)

export function OptimisticEntitlementsProvider(props: {
  children: React.ReactNode
}) {
  const [optimisticEntitlements, setOptimisticEntitlements] = useState<
    UserEntitlement[]
  >([])

  const setOptimisticEntitlement = useCallback((entitlement: UserEntitlement) => {
    setOptimisticEntitlements((prev) => {
      const idx = prev.findIndex(
        (e) => e.entitlementId === entitlement.entitlementId
      )
      if (idx >= 0) {
        const newPrev = [...prev]
        newPrev[idx] = entitlement
        return newPrev
      }
      return [...prev, entitlement]
    })
  }, [])

  const clearOptimisticEntitlements = useCallback(() => {
    setOptimisticEntitlements([])
  }, [])

  const value = useMemo(
    () => ({
      optimisticEntitlements,
      setOptimisticEntitlement,
      clearOptimisticEntitlements,
    }),
    [optimisticEntitlements, setOptimisticEntitlement, clearOptimisticEntitlements]
  )

  return (
    <OptimisticEntitlementsContext.Provider value={value}>
      {props.children}
    </OptimisticEntitlementsContext.Provider>
  )
}

export function useOptimisticEntitlements() {
  return useContext(OptimisticEntitlementsContext)
}

// Helper to merge server entitlements with optimistic ones
export function mergeEntitlements(
  serverEntitlements: UserEntitlement[] | undefined,
  optimisticEntitlements: UserEntitlement[]
): UserEntitlement[] {
  const merged = [...(serverEntitlements ?? [])]
  for (const optimistic of optimisticEntitlements) {
    const idx = merged.findIndex(
      (e) => e.entitlementId === optimistic.entitlementId
    )
    if (idx >= 0) {
      merged[idx] = optimistic
    } else {
      merged.push(optimistic)
    }
  }
  return merged
}
