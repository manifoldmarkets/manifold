import { useEffect, useState } from 'react'
import { ManaPayTxn } from 'common/txn'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { sortBy, uniqBy } from 'lodash'
import { useEvent } from 'web/hooks/use-event'

export const useManaPayments = (userId?: string) => {
  const [manaPayments, setManaPayments] = useState<ManaPayTxn[] | undefined>(
    undefined
  )
  const load = useEvent(() => {
    for (const param of userId
      ? [{ fromId: userId }, { toId: userId }]
      : [{}]) {
      const query = db
        .from('txns')
        .select('data')
        .contains('data', {
          category: 'MANA_PAYMENT',
          ...param,
        })
        .order('data->createdTime', { ascending: false } as any)
        .limit(100)
      run(query).then((data) => {
        const payments = data.data.map((txn) => txn.data as ManaPayTxn) ?? []

        setManaPayments((p) => uniqBy((p ?? []).concat(payments), 'id'))
      })
    }
  })
  useEffect(() => {
    load()
  }, [userId])

  return { payments: sortBy(manaPayments, (txn) => -txn.createdTime), load }
}
