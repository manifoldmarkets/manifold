import type { MultiContract, Sports } from 'common/contract'

/** Native answer IDs for the two verified provider entrants, at funding or on reread. */
export function majorAnswerIds(
  contract: MultiContract & Partial<Sports>,
  teams: Partial<Sports> = contract
) {
  const entrants = contract.sportsEntrantIds
  if (
    !Array.isArray(entrants) ||
    entrants.length !== 2 ||
    contract.answers.length !== 2 ||
    !teams.sportsHomeTeam ||
    !teams.sportsAwayTeam ||
    teams.sportsHomeTeam === teams.sportsAwayTeam
  )
    return
  const answer = (teamId: string | undefined, name: string) => {
    const index = entrants.findIndex(
      (id) =>
        typeof id === 'number' &&
        Number.isSafeInteger(id) &&
        id > 0 &&
        String(id) === teamId
    )
    const a = contract.answers[index]
    return a &&
      a.index === index &&
      a.contractId === contract.id &&
      a.text === name &&
      !a.isOther &&
      a.resolution == null &&
      a.resolutionTime == null
      ? a.id
      : undefined
  }
  const home = answer(teams.sportsHomeTeamId, teams.sportsHomeTeam)
  const away = answer(teams.sportsAwayTeamId, teams.sportsAwayTeam)
  return home && away && home !== away ? { home, away } : undefined
}
