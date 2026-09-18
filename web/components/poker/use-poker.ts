import { useCallback, useEffect, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { PokerAction, PokerTableView } from 'common/poker/types'
import { api, APIError } from 'web/lib/api/api'

import { restorePokerToken } from './access-token'
import { submitPokerAction } from './api'
export function usePoker(
  tableId: string | undefined,
  userId: string | undefined
) {
  const [data, setData] = useState<PokerTableView>()
  const [token, setToken] = useState<string>()
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(true)
  const lastSuccess = useRef(0)
  const generation = useRef(0)
  const requestRunning = useRef(false)
  const current = useRef(data)
  current.current = data
  useEffect(() => {
    setData(undefined)
    setInitialized(false)
    if (!tableId) return
    setToken(restorePokerToken(tableId))
    setInitialized(true)
  }, [tableId])
  const refresh = useCallback(async () => {
    if (!tableId || !initialized) return
    const stamp = generation.current
    try {
      const result = await api('get-poker-table', {
        tableId,
        accessToken: token,
      })
      if (stamp !== generation.current) return
      // An older overlapping response cannot replace newer table state.
      setData((prev) =>
        !prev || result.version >= prev.version ? result : prev
      )
      lastSuccess.current = Date.now()
      setConnected(true)
      setError('')
      return result
    } catch (e) {
      if (stamp !== generation.current) return
      setError(e instanceof Error ? e.message : 'Could not load table')
      if (e instanceof APIError && (e.code === 403 || e.code === 404))
        setData(undefined)
      if (Date.now() - lastSuccess.current > 5000) setConnected(false)
    }
  }, [tableId, token, initialized, userId])
  const latestRefresh = useRef(refresh)
  latestRefresh.current = refresh
  useApiSubscription({
    topics: ['poker'],
    enabled: initialized,
    onBroadcast: () => {
      void latestRefresh.current()
    },
  })
  useEffect(() => {
    generation.current++
    setData(undefined)
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 2000)
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('online', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      generation.current++
      clearInterval(timer)
      window.removeEventListener('online', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])
  const act = async (action: PokerAction) => {
    if (!tableId || !current.current || requestRunning.current) return false
    requestRunning.current = true
    setBusy(true)
    setError('')
    // Reuse the same ID on a network retry; never turn one click into two bets.
    const request = {
      tableId,
      accessToken: token,
      requestId: crypto.randomUUID(),
      version: current.current.version,
      action,
    }
    try {
      await submitPokerAction(request)
      await refresh()
      return true
    } catch (e) {
      await refresh()
      setError(e instanceof Error ? e.message : 'Action failed. Please retry.')
      return false
    } finally {
      requestRunning.current = false
      setBusy(false)
    }
  }
  return { data, error, busy, connected, act, refresh, token }
}
