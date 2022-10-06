// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// Integrate Sprig

import { ENV_CONFIG } from 'common/envs/constants'
import { PROD_CONFIG } from 'common/envs/prod'

if (ENV_CONFIG.domain === PROD_CONFIG.domain) {
  try {
    ;(function (l, e, a, p) {
      if (window.Sprig) return
      window.Sprig = function (...args) {
        S._queue.push(args)
      }
      const S = window.Sprig
      S.appId = a
      S._queue = []
      window.UserLeap = S
      a = l.createElement('script')
      a.async = 1
      a.src = e + '?id=' + S.appId
      p = l.getElementsByTagName('script')[0]
      p.parentNode.insertBefore(a, p)
    })(document, 'https://cdn.sprig.com/shim.js', ENV_CONFIG.sprigEnvironmentId)
  } catch (error) {
    console.log('Error initializing Sprig, please complain to Barak', error)
  }
}

export function setUserId(userId: string): void {
  if (window.Sprig) window.Sprig('setUserId', userId)
}

export function setAttributes(attributes: Record<string, unknown>): void {
  if (window.Sprig) window.Sprig('setAttributes', attributes)
}
