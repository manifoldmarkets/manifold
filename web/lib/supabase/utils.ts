import {
  SupabaseClient,
  TableName,
  RowFor,
  ViewName,
  DataFor,
} from 'common/supabase/utils'
import { useIsAuthorized } from 'web/hooks/use-user'
import { useEffect, useState } from 'react'
import { uniqBy } from 'lodash'

export function useValuesOnContract<
  T extends TableName | ViewName,
  K extends keyof RowFor<T>
>(
  tableName: T,
  uniqueKeyBy: K,
  contractId: string,
  db: SupabaseClient,
  getInitialValues?: (contractId: string) => Promise<RowFor<T>[]>
) {
  const isAuthorized = useIsAuthorized()
  const [values, setValues] = useState<RowFor<T>[] | null | undefined>(
    undefined
  )

  const loadInitialValuesForContractId = async () => {
    if (values !== undefined) return
    const { data } = await db
      .from(tableName)
      .select('*')
      .eq('contract_id', contractId)
    if (data) {
      setValues(data)
    }
  }

  useEffect(() => {
    if (getInitialValues) getInitialValues(contractId).then(setValues)
    else loadInitialValuesForContractId()
  }, [contractId, getInitialValues])

  useEffect(() => {
    if (!values) return
    console.log('values:', values.length)
  }, [values])

  useEffect(() => {
    if (!isAuthorized) return
    const channel = db.channel(tableName + `-realtime`)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: tableName,
        filter: `contract_id=eq.${contractId}`,
      },
      (payload: any) => {
        setValues((prev) => {
          const { new: newRecord, old: oldRecord } = payload
          // New row with filled values
          if (newRecord && newRecord[uniqueKeyBy]) {
            const newValue = newRecord as RowFor<T>
            const index = prev?.findIndex((m) => m[uniqueKeyBy] === newValue[uniqueKeyBy])
            // We already have this row, so update it
            if (oldRecord && index && index > -1) {
              return prev?.map((m, i) => (i === index) ? newValue : m)
              // We don't have this row, or there wasn't an old record in supabase, so add it
            } else {
              return uniqBy([...(prev || []), newValue], uniqueKeyBy)
            }
            // Empty row, delete it
          } else {
            const oldValue = oldRecord as RowFor<T>
            return prev?.filter((m) => {
              return m[uniqueKeyBy] !== oldValue[uniqueKeyBy]
            })
          }
        })
      }
    )
    channel.subscribe(async (status) => {
      console.log('status', status)
    })
    return () => {
      db.removeChannel(channel)
    }
  }, [db, contractId, isAuthorized])

  return values?.map((m) => ('data' in m ? (m.data as DataFor<T>) : m))
}