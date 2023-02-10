import { Bet } from './bet'
import { Comment } from './comment'
import { Contract } from './contract'

export type feed = {
  contract: Contract
  recentBets: Bet[]
  recentComments: Comment[]
}[]
