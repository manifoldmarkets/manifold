import { Contract } from './contract'
import { Post } from './post'

export type GlobalConfig = {
  pinnedItems: { item: Post | Contract; type: 'post' | 'contract' }[]
}
