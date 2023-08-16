export const getLeagueChatChannelId = (
  season: number,
  division: number,
  cohort: string
) => `league-${season}-${division}-${cohort}`
export const getSeasonDivisionCohort = (channelId: string) => {
  const [season, division, cohort1, cohort2] = channelId.split('-').slice(1)
  return {
    season: parseInt(season),
    division: parseInt(division),
    cohort: `${cohort1}-${cohort2}`,
  }
}
