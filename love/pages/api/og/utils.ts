import { User } from 'common/user'
import { buildOgUrl } from 'common/util/og'
import { Lover } from 'love/hooks/use-lover'

export type LoveOgProps = {
  // user props
  avatarUrl: string
  username: string
  name: string
  // lover props
  birthdate: string
  city: string
  gender: string
}

export function loveOgImageUrl(user: User, lover?: Lover | null) {
  const loveProps = {
    avatarUrl: user.avatarUrl,
    username: user.username,
    name: user.name,
    birthdate: lover?.birthdate ?? '2000-01-01',
    city: lover?.city ?? 'Internet',
    gender: lover?.gender ?? '???',
  } as LoveOgProps
  // TODO: would be better to unify with buildOgUrl from common/util/og,
  // but we'd need to pass in the "manifold.love" domain
  const params = new URLSearchParams(loveProps).toString()
  return `https://manifold.love/api/og/lover?${params}`
}
