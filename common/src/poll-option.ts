export type PollOption = {
  id: string
  index: number // Order of the options in the list
  text: string
  votes: number
  // For ranked-choice voting: sum of points using Borda count
  // (n points for 1st choice, n-1 for 2nd, etc.)
  rankedVoteScore?: number
}
