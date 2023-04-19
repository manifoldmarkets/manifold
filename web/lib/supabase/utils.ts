import {
  SupabaseClient,
  TableName,
  RowFor,
  ViewName,
  DataFor,
} from 'common/supabase/utils'
import {useIsAuthorized} from 'web/hooks/use-user'
import {useEffect, useState} from 'react'
import {uniqBy} from 'lodash'
import {filterDefined} from "common/util/array";
import {RealtimeChannel} from "@supabase/realtime-js";

function hasFsUpdatedTime(obj: any): obj is { fs_updated_time: number } {
  return 'fs_updated_time' in obj;
}

const channels = new Map<string, RealtimeChannel>();
const subscriptionStatuses = new Map<string, string>();
const callbackMap = new Map<string, ((data: any) => void)[]>();
const channelResubscribeIntervals = new Map<string, any>();

export function useValuesFromSupabase<
  T extends TableName | ViewName,
  K extends keyof RowFor<T>
>(
  tableName: T,
  rowGroupKey: K,
  rowGroupValue: string,
  rowDataKey: K,
  db: SupabaseClient,
  getInitialValues?: (uniqueRowGroupValue: string) => Promise<RowFor<T>[]>
) {
  const isAuthorized = useIsAuthorized()
  const [values, setValues] = useState<RowFor<T>[]>([])
  const channelName = tableName + '-realtime'
  const [valuesToDelete, setValuesToDelete] = useState<RowFor<T>[]>([])
  const [retrievedInitialValues, setRetrievedInitialValues] = useState(false)
  const [intervalId, setIntervalId] = useState<any>()

  useEffect(() => {
    if (!isAuthorized) return
    initChannel()
  }, [isAuthorized, channelName, db])
  const initChannel = () => {
    const channel = db.channel(tableName + `-realtime`)
    // very first channel opened, register the callbacks
    if (!channels.get(channelName)) {
      subscribeToChannel(channel)
      channels.set(channelName, channel)
    } else {
      const currentCallbacks = callbackMap.get(channelName) ?? []
      currentCallbacks.push(updateValuesOnSubscriptionEvent)
      callbackMap.set(channelName, currentCallbacks)
    }
    return channel
  }
  // called once per channel
  const subscribeToChannel = (channel: RealtimeChannel) => {
    const status = subscriptionStatuses.get(channelName)
    if (!channel || status === 'SUBSCRIBED') return
    const currentCallbacks = callbackMap.get(channelName) ?? []
    currentCallbacks.push(updateValuesOnSubscriptionEvent)
    callbackMap.set(channelName, currentCallbacks)
    setChannelCallbacks(channel)
    channel.subscribe(async (status, err) => {
      console.log('channel subscribe status', status, err)
      subscriptionStatuses.set(channelName, status)
      if (status !== 'SUBSCRIBED' && !channelResubscribeIntervals.get(channelName)) {
        startResubscribeLoop()
      }
    })
  }

  const updateValuesOnSubscriptionEvent = (payload: any) => {
    setValues((prev) => {
      const {new: newRecord, old: oldRecord} = payload
      // if this is a DELETE operation, the oldValue will only have the primary key values set
      const oldValue = oldRecord as RowFor<T>
      const index = prev.findIndex((m) => m[rowDataKey] === oldValue[rowDataKey])
      // New row with filled values
      if (newRecord && newRecord[rowDataKey]) {
        const newValue = newRecord as RowFor<T>
        // We already have this row, so update it
        if (oldRecord && index > -1) {
          prev[index] = newValue
          return prev
        }
        // We don't have this row, or there wasn't an old record in supabase, so add it
        else return uniqBy([...prev, newValue], rowDataKey)

        // Empty new record, delete it or save it for deletion
      } else {
        if (index > -1) {
          prev.splice(index, 1)
          return prev
        }
        // Delete the value once we get the values
        setValuesToDelete((previousDeleteValues) => [...previousDeleteValues, oldValue])
        return prev
      }
    })
  }

  const loadDefaultAllInitialValuesForRowGroup = async () => {
    const {data} = await db
      .from(tableName)
      .select('*')
      .eq(rowGroupKey as string, rowGroupValue)
    if (data) {
      setValues(data)
    }
  }

  useEffect(() => {
    if (!isAuthorized) return
    const interval = setInterval(() => {
      // TODO: how do we handle channel error?
      const subscriptionStatus = subscriptionStatuses.get(channelName)
      if (retrievedInitialValues ||
        (subscriptionStatus !== 'SUBSCRIBED' && subscriptionStatus !== 'CHANNEL_ERROR')) return
      setRetrievedInitialValues(true)
      // Retrieve initial values
      if (getInitialValues) getInitialValues(rowGroupValue).then((newValues) => setValues((prev) => {
          return filterDefined(newValues.map((newVal) => {
            const index = prev.findIndex((p) => p[rowDataKey] == newVal[rowDataKey])
            // previous value exists in subscription
            if (index > -1) {
              const prevVal = prev[index]
              if (hasFsUpdatedTime(prevVal) && hasFsUpdatedTime(newVal)) {
                return prevVal.fs_updated_time > newVal.fs_updated_time ? prevVal : newVal
              } else return newVal
            }
            if (valuesToDelete.find((v) => v[rowDataKey] == newVal[rowDataKey])) return null
            return newVal
          }))
        })
      )
      else loadDefaultAllInitialValuesForRowGroup()
      setValuesToDelete([])
    }, 100)
    if (retrievedInitialValues) clearInterval(interval)
    return () => clearInterval(interval)
  }, [rowGroupValue, getInitialValues, retrievedInitialValues, isAuthorized, channelName, rowDataKey])

  useEffect(() => {
    if (!values) return
    console.log('values:', values)
  }, [JSON.stringify(values)])

  const startResubscribeLoop = () => {
    const existingIntervalId = channelResubscribeIntervals.get(channelName);
    if (existingIntervalId) {
      console.log('clearing existing interval', existingIntervalId)
      clearInterval(existingIntervalId);
    }
    const interval = setInterval(async () => {
      const intervalId = channelResubscribeIntervals.get(channelName)
      if (intervalId !== interval) return
      console.log('running interval', interval)
      const status = subscriptionStatuses.get(channelName)
      console.log('interval status', status)
      if (status !== 'SUBSCRIBED') {
        const channel = channels.get(channelName)
        if (channel) {
          await db.removeChannel(channel)
          channels.delete(channelName)
        }
        initChannel()
      } else {
        console.log('clearing interval else', interval)
        clearInterval(interval)
        channelResubscribeIntervals.delete(channelName)
      }
    }, 3000)
    setIntervalId(interval)
    channelResubscribeIntervals.set(channelName, interval);
  }

  const setChannelCallbacks = (channel: RealtimeChannel) => {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: tableName,
        filter: `${rowGroupKey as string}=eq.${rowGroupValue}`,
      },
      (payload: any) => {
        console.log('payload', payload)
        const callbacks = callbackMap.get(channelName)
        callbacks?.forEach((cb) => cb(payload))
      }
    )
  }

  useEffect(() => {
    return () => {
      if (!intervalId) return
      console.log('clearing interval useeffect',)
      const existingIntervalId = channelResubscribeIntervals.get(channelName);
      clearInterval(intervalId)
      if (existingIntervalId === intervalId) channelResubscribeIntervals.delete(channelName)

    }
  }, [intervalId])
  return values.map((m) => ('data' in m ? (m.data as DataFor<T>) : m))
}