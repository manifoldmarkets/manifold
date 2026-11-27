import { groupBy, uniqBy } from 'lodash'

import { EsportsTeamRef } from 'common/esports/types'

/** The longest code a plate holds. */
const MAX_CODE = 8

/** The provider's own code, when it sent one that fits a plate. */
const sentCode = (team: EsportsTeamRef) => {
  const code = team.code?.trim()
  return code && code.length <= MAX_CODE ? code : undefined
}

/**
 * The provider's code when it fits a plate, never cut short. Otherwise
 * initials from the name: "Hanwha Life Esports" is HLE.
 */
export function teamCode(team: EsportsTeamRef) {
  const sent = sentCode(team)
  if (sent) return sent
  const words = team.name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return (
    words.length > 1 ? words.map((w) => w[0]).join('') : words[0] ?? team.name
  ).slice(0, 4)
}

/**
 * Plate codes for teams shown together, by team id. Where two teams' codes
 * would read the same on a plate, they get the start of their names instead,
 * letters and digits only: "BC.Game" and "benched gods" are both BG, so they
 * read BCGA and BENC. The names are taken a letter longer until they differ.
 * A code the provider sent is kept unless another team was sent the same one.
 */
export function plateCodes(teams: EsportsTeamRef[]): Record<number, string> {
  const unique = uniqBy(teams, 'id')
  const codes: Record<number, string> = {}
  for (const team of unique) codes[team.id] = teamCode(team)
  const lengthened = new Set<number>()
  for (let length = 4; length <= MAX_CODE; length++) {
    // Plates are upper case, so "bg" and "BG" read the same.
    const clashes = Object.values(
      groupBy(unique, (t) => codes[t.id].toUpperCase())
    ).filter((group) => group.length > 1)
    if (clashes.length === 0) break
    for (const group of clashes) {
      const sent = group.filter((t) => sentCode(t) && !lengthened.has(t.id))
      for (const team of sent.length === 1
        ? group.filter((t) => t !== sent[0])
        : group) {
        const start = team.name.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, length)
        if (!start) continue
        codes[team.id] = start
        lengthened.add(team.id)
      }
    }
  }
  return codes
}
