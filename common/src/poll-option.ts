export type PollOption = {
  id: string
  index: number // Order of the options in the list
  text: string
  votes: number
  // Borda score for ranked-choice polls (used for display/sorting)
  rankedVoteScore?: number
}
