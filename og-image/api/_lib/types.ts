export type FileType = 'png' | 'jpeg'
export type Theme = 'light' | 'dark'

export interface ParsedRequest {
  fileType: FileType
  text: string
  theme: Theme
  md: boolean
  fontSize: string
  images: string[]
  widths: string[]
  heights: string[]

  // Attributes for Manifold card:
  question: string
  probability: string
  numericValue: string
  metadata: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl: string
  // Challenge attributes:
  challengerAmount: string
  challengerOutcome: string
  creatorAmount: string
  creatorOutcome: string
  acceptedName: string
  acceptedAvatarUrl: string
}
