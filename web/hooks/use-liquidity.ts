import { convertTxn } from 'common/supabase/txns'
import { run } from 'common/supabase/utils'
import { AddSubsidyTxn } from 'common/txn'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'

export const useLiquidity = (contractId: string) => {
  const [liquidities, setLiquidities] = useState<AddSubsidyTxn[]>([])

  useEffect(() => {
    run(
      db
        .from('txns')
        .select()
        .eq('category', 'ADD_SUBSIDY')
        .eq('to_id', contractId)
        .order('created_time', { ascending: true })
    ).then(({ data }) => setLiquidities(data.map(convertTxn) as any))
  }, [])

  return liquidities
}
