import { collection } from 'firebase/firestore'
import { maxBy } from 'lodash'
import { useEffect, useRef } from 'react'
import { db } from 'web/lib/firebase/init'
import { listenForValues } from 'web/lib/firebase/utils'

export const useRefreshAllClients = () => {
  const latestRefreshTimestamp = useRef(0)

  useEffect(() => {
    const ref = collection(db, 'refresh-all-clients')

    listenForValues<{ timestamp: number }>(ref, (values) => {
      const lastValue = maxBy(values, (value) => value.timestamp)
      if (!lastValue) return

      if (latestRefreshTimestamp.current === 0) {
        latestRefreshTimestamp.current = lastValue.timestamp
      } else if (lastValue.timestamp > latestRefreshTimestamp.current) {
        console.log('reloading b/c of refresh-all-clients')
        window.location.reload()
      }
    })
  }, [])
}
