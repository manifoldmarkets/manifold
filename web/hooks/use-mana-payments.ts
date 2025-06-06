import { useEffect, useState } from 'react'
import { ManaPayTxn } from 'common/txn'
import { sortBy, uniqBy } from 'lodash'
import { useEvent } from 'client-common/hooks/use-event'
import { buildArray } from 'common/util/array'
import { api } from 'web/lib/api/api'

export const useManaPayments = (userId?: string) => {
  const [manaPayments, setManaPayments] = useState<ManaPayTxn[] | undefined>(
    undefined
  )
  const load = useEvent(() => {
    if (!userId) return

    Promise.all([
      api('txns', { category: 'MANA_PAYMENT', fromId: userId }),
      api('txns', { category: 'MANA_PAYMENT', toId: userId }),
    ]).then(([from, to]) => {
      setManaPayments(
        (p) => uniqBy(buildArray(p, from, to), 'id') as ManaPayTxn[]
      )
    })
  })

  useEffect(() => {
    load()
  }, [userId])

  return { payments: sortBy(manaPayments, (txn) => -txn.createdTime), load }
}

export const useAllManaPayments = () => {
  const [manaPayments, setManaPayments] = useState<ManaPayTxn[] | undefined>(
    undefined
  )
  const load = useEvent(() => {
    api('txns', { category: 'MANA_PAYMENT' }).then((payments) => {
      setManaPayments(
        (p) => uniqBy(buildArray(p, payments), 'id') as ManaPayTxn[]
      )
    })
  })

  useEffect(() => {
    load()
  }, [])

  return { payments: sortBy(manaPayments, (txn) => -txn.createdTime), load }
}
