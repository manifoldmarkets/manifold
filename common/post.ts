export type Post = {
  id: string
  title: string
  content: string
  creatorId: string // User id
  createdTime: number
  slug: string
}

export const MAX_POST_TITLE_LENGTH = 480
