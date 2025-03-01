import { Row } from './supabase/utils'

export type Reaction = Row<'user_reactions'>

export type ReactionContentTypes = 'contract' | 'comment'

export type ReactionType = 'like' | 'dislike'

// export type ReactionTypes = 'like'
