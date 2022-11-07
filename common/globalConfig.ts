import { Contract } from './contract'
import { Group } from './group'
import { Post } from './post'

export type GlobalConfig = {
  pinnedItems: {
    item: Post | Contract | Group
    type: 'post' | 'contract' | 'group'
  }[]
}
