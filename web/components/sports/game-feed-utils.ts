import dayjs from 'dayjs'
import {
  getGameDisplayTeams as getDisplayTeams,
  scheduleFeedTime,
} from 'common/sports-game-feed'
import { ScheduleGame } from 'common/sports-schedule'

type FeedTime = Parameters<typeof scheduleFeedTime>[0]
type DaySection<T> = { key: string; label: string; items: T[] }

export const scheduleDayKey = (item: FeedTime) =>
  dayjs(scheduleFeedTime(item)).format('YYYY-MM-DD')

function dayLabel(ms: number, now = Date.now()): string {
  const d = dayjs(ms)
  const today = dayjs(now)
  if (d.isSame(today, 'day')) return 'Today'
  if (d.isSame(today.add(1, 'day'), 'day')) return 'Tomorrow'
  return d.format('dddd')
}

/** Group items by the local calendar day of `time(item)`, keeping their order. */
export function groupByDay<T>(
  items: readonly T[],
  time: (item: T) => number,
  now = Date.now()
): DaySection<T>[] {
  const map = new Map<string, DaySection<T>>()
  for (const item of items) {
    const ms = time(item)
    const key = dayjs(ms).format('YYYY-MM-DD')
    const section = map.get(key)
    if (section) section.items.push(item)
    else map.set(key, { key, label: dayLabel(ms, now), items: [item] })
  }
  return [...map.values()]
}

export function groupScheduleDays<T extends FeedTime>(
  items: readonly T[],
  now = Date.now()
) {
  return groupByDay(items, scheduleFeedTime, now).sort((a, b) =>
    a.key.localeCompare(b.key)
  )
}

// Shared by the interactive feed and its server-rendered social preview.
export {
  compareGameStartTime,
  compareGameVolume,
  selectFeaturedGame,
} from 'common/sports-game-feed'

/** Typed for the feed, so `ReturnType` keeps the full ScheduleTeam. */
export const getGameDisplayTeams = (
  game: Pick<ScheduleGame, 'home' | 'away' | 'draw'>
) => getDisplayTeams(game)
