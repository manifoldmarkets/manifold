export const getLeagueChatChannelId = (
  season: number,
  division: number,
  cohort: string
) => `league-${season}-${division}-${cohort}`
