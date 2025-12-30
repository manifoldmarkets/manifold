// Represents a vote stored in the votes table
export type PollVote = {
  id: string // option id
  contractId: string
  userId: string
  createdTime: number
  // For ranked-choice voting: 1 = first choice, 2 = second, etc.
  // Null for single-vote and multi-select polls
  rank?: number | null
}

// For casting votes via the API
export type CastPollVoteRequest =
  | {
      // Single vote (original behavior)
      contractId: string
      voteId: string
    }
  | {
      // Multi-select: vote for multiple options
      contractId: string
      voteIds: string[]
    }
  | {
      // Ranked-choice: ordered array of option IDs (first = most preferred)
      contractId: string
      rankedVoteIds: string[]
    }
