import { BDL_LEAGUES } from 'common/bdl/leagues'
import { EsportsGame } from 'common/esports/types'

/** The games with a tournament page, by URL key, in the order the chips show. */
export const ESPORTS_GAMES = [
  { key: 'cs2', game: 'cs', mark: 'CS' },
  { key: 'valorant', game: 'valorant', mark: 'VAL' },
  { key: 'lol', game: 'lol', mark: 'LoL' },
  { key: 'dota2', game: 'dota', mark: 'D2' },
] as const satisfies readonly { key: string; game: EsportsGame; mark: string }[]

export type EsportsGameInfo = (typeof ESPORTS_GAMES)[number]
export type EsportsGameKey = EsportsGameInfo['key']

export const esportsGameByKey = (key: string | undefined) =>
  ESPORTS_GAMES.find((g) => g.key === key)
export const esportsGameInfo = (game: EsportsGame) =>
  ESPORTS_GAMES.find((g) => g.game === game) ?? ESPORTS_GAMES[0]

/** "Counter-Strike 2", or "CS2" where space is short. */
export const esportsGameLabel = (game: EsportsGame, short = false) =>
  short ? BDL_LEAGUES[game].shortLabel : BDL_LEAGUES[game].label

export const esportsPath = (key?: EsportsGameKey) =>
  key ? `/esports/${key}` : '/esports'
