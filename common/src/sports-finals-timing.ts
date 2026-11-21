import { BDL_ESPORTS_FINALS_FROM_MINUTES } from './bdl/constants'
import type { SportId } from './sports-calendar'

/**
 * Minutes after kickoff when a game is due to end: the usual length with
 * breaks, a little early so the final is caught soon after the whistle.
 */
export const FINALS_FROM_MINUTES = {
  nfl: 180,
  cfb: 195,
  mlb: 150,
  nba: 130,
  wnba: 115,
  soccer: 105,
  nhl: 140,
  cbb: 115,
  football: 180,
  basketball: 115,
  wcbb: 115,
  hockey: 140,
  afl: 130,
  nrl: 100,
  handball: 75,
  tennis: 120,
  f1: 90,
  tdf: 240,
  mma: 20,
  golf: null, // The provider marks a round official independently of start time.
  cs2: BDL_ESPORTS_FINALS_FROM_MINUTES[1],
  valorant: BDL_ESPORTS_FINALS_FROM_MINUTES[1],
  lol: BDL_ESPORTS_FINALS_FROM_MINUTES[1],
  dota2: BDL_ESPORTS_FINALS_FROM_MINUTES[1],
  cbase: 150,
} satisfies Record<SportId, number | null>
