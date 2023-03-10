import { Post } from './post'

export type Ad = Exclude<Post, 'subtitle'> & {
  type: 'ad'
  totalCost: number
  funds: number
  costPerView: number
}
