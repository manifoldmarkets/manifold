import { PROJECT_ID } from 'common/envs/constants'
import { setCookie, getCookies } from '../util/cookie'
import { IncomingMessage, ServerResponse } from 'http'

const TOKEN_KINDS = ['refresh', 'id'] as const
type TokenKind = typeof TOKEN_KINDS[number]

const getAuthCookieName = (kind: TokenKind) => {
  const suffix = `${PROJECT_ID}_${kind}`.toUpperCase().replace(/-/g, '_')
  return `FIREBASE_TOKEN_${suffix}`
}

const ID_COOKIE_NAME = getAuthCookieName('id')
const REFRESH_COOKIE_NAME = getAuthCookieName('refresh')

export const getAuthCookies = (request?: IncomingMessage) => {
  const data = request != null ? request.headers.cookie ?? '' : document.cookie
  const cookies = getCookies(data)
  return {
    idToken: cookies[ID_COOKIE_NAME] as string | undefined,
    refreshToken: cookies[REFRESH_COOKIE_NAME] as string | undefined,
  }
}

export const setAuthCookies = (
  idToken?: string,
  refreshToken?: string,
  response?: ServerResponse
) => {
  // these tokens last an hour
  const idMaxAge = idToken != null ? 60 * 60 : 0
  const idCookie = setCookie(ID_COOKIE_NAME, idToken ?? '', [
    ['path', '/'],
    ['max-age', idMaxAge.toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
  // these tokens don't expire
  const refreshMaxAge = refreshToken != null ? 60 * 60 * 24 * 365 * 10 : 0
  const refreshCookie = setCookie(REFRESH_COOKIE_NAME, refreshToken ?? '', [
    ['path', '/'],
    ['max-age', refreshMaxAge.toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
  if (response != null) {
    response.setHeader('Set-Cookie', [idCookie, refreshCookie])
  } else {
    document.cookie = idCookie
    document.cookie = refreshCookie
  }
}

export const deleteAuthCookies = () => setAuthCookies()
