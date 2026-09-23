import {
  BrowseMode,
  canDefaultToForYou,
  getInitialBrowseForYou,
  readBrowseMode,
  readBrowseParameters,
} from 'common/browse-personalization'
import { User } from 'common/user'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { api } from 'web/lib/api/api'
import {
  getPersistentLocalState,
  setPersistentLocalState,
} from './use-persistent-local-state'

const READINESS_TIMEOUT_MS = 1500

export const useBrowseDefault = (user: User | null | undefined) => {
  const router = useRouter()
  const navigation = useRef(router)
  navigation.current = router
  const account = user === undefined ? undefined : user?.id ?? 'anonymous'
  const persistPrefix = `browse-v1-${account}`
  const preferenceKey = `${persistPrefix}-mode`
  const paramsKey = `${persistPrefix}-local-state`
  const [initial, setInitial] = useState<{
    account: string
    forYou: '0' | '1'
  }>()

  useEffect(() => {
    if (account === undefined || !router.isReady) return
    let cancelled = false
    const controller = new AbortController()
    const stored = readBrowseParameters(getPersistentLocalState(paramsKey))
    const urlParams = readBrowseParameters(navigation.current.query)
    const params = { ...stored, ...urlParams }
    const preference = readBrowseMode(getPersistentLocalState(preferenceKey))
    const finish = (eligible: boolean) => {
      if (cancelled) return
      const forYou = getInitialBrowseForYou({
        params,
        urlParams,
        preference,
        eligible,
      })
      // Seed the account-scoped search state before mounting Search. In
      // particular, yesterday's automatic All is not a permanent opt-out.
      setPersistentLocalState(paramsKey, { ...stored, fy: forYou })
      // Keep this history entry's choice stable on Back/refresh, even if the
      // user crosses the threshold after opening a market. A new /browse
      // navigation without fy can reconsider the automatic default.
      if (urlParams.fy !== '0' && urlParams.fy !== '1') {
        const { pathname, query, replace } = navigation.current
        void replace({ pathname, query: { ...query, fy: forYou } }, undefined, {
          shallow: true,
        })
      }
      setInitial({ account, forYou })
    }
    const needsReadiness =
      account !== 'anonymous' &&
      !preference &&
      urlParams.fy !== '0' &&
      urlParams.fy !== '1' &&
      canDefaultToForYou(params)

    if (!needsReadiness) {
      finish(false)
      return () => {
        cancelled = true
      }
    }

    // Do not send a preliminary All request and then switch the user mid-page.
    // The old API, a network error, or a timeout simply starts this visit on All.
    const timeout = setTimeout(() => {
      controller.abort()
      finish(false)
      cancelled = true
    }, READINESS_TIMEOUT_MS)
    void api('get-browse-personalization', {}, { signal: controller.signal })
      .then(({ eligible }) => finish(eligible === true))
      .catch(() => finish(false))
      .finally(() => clearTimeout(timeout))

    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [account, paramsKey, preferenceKey, router.isReady])

  const rememberMode = (mode: BrowseMode) => {
    if (account !== undefined) setPersistentLocalState(preferenceKey, mode)
  }

  return {
    ready: account !== undefined && initial?.account === account,
    defaultForYou: initial?.account === account ? initial?.forYou : '0',
    persistPrefix,
    rememberMode,
  }
}
