import { useEffect, useState } from 'react'

import { Contract } from 'common/contract'
import { getContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'

// A market's stored copy, by slug: enough to find it and show it while the
// live one loads (useLiveContractWithStatus). `error` when it can't be read
// or doesn't exist. Used by /election's map card and its bet dialog for the
// markets the page knows only by slug.
export function useContractBySlug(slug: string) {
  const [contract, setContract] = useState<Contract | undefined>()
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    setContract(undefined)
    setError(false)
    getContracts(db, [slug], 'slug')
      .then(([c]) => {
        if (cancelled) return
        if (c) setContract(c)
        else setError(true)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [slug])
  return { contract, error }
}
