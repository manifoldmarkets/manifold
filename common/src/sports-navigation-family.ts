import type { AnySportKey, SportInfo } from './sports-schedule'
import type { BdlLeagueKey } from './bdl/leagues'

// Schedule rows retain their native sport (including the older league-specific
// URLs). Only the navigation and the family page's read group these together.
const families = {
  basketball: {
    label: 'Basketball',
    members: ['basketball', 'nba', 'wnba', 'ncaab', 'wncaab'],
  },
  football: { label: 'Football', members: ['football', 'nfl', 'ncaaf'] },
  baseball: {
    label: 'Baseball',
    members: ['baseball', 'mlb', 'college-baseball'],
  },
  hockey: { label: 'Hockey', members: ['hockey', 'nhl'] },
  racing: { label: 'Racing', members: ['racing', 'f1'] },
}

const familyByKey = new Map(
  Object.entries(families).flatMap(([key, family]) =>
    family.members.map((member) => [member, key] as const)
  )
)

export const sportsFamily = (key: AnySportKey, league?: BdlLeagueKey) =>
  key === 'other' && league === 'cbb' ? 'baseball' : familyByKey.get(key) ?? key

export function sportsFamilies(sports: SportInfo[]) {
  const grouped = new Map<string, SportInfo>()
  for (const sport of sports) {
    const key = sportsFamily(sport.key)
    const group = grouped.get(key)
    if (group) {
      group.groupIds = Array.from(
        new Set([...group.groupIds, ...sport.groupIds])
      )
      if (sport.key === key) group.slug = sport.slug
    } else {
      const label = Object.entries(families).find(([k]) => k === key)?.[1].label
      grouped.set(
        key,
        label
          ? {
              key,
              label,
              longLabel: label,
              emoji: sport.emoji,
              groupIds: [...sport.groupIds],
              slug: sport.key === key ? sport.slug : undefined,
            }
          : { ...sport, groupIds: [...sport.groupIds] }
      )
    }
  }
  return Array.from(grouped.values())
}
