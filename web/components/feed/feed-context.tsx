import { createContext, ReactNode, useContext } from 'react'
import { CommentTipMap, useTipTxns } from 'web/hooks/use-comment-tips'

const FeedContext = createContext<CommentTipMap | null | undefined>(null)

export function FeedContextProvider(props: {
  contractId: string
  children: ReactNode
}) {
  const { contractId, children } = props
  const value = useTipTxns(contractId)

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>
}

const useAllTips = () => useContext(FeedContext)

export const useCommentTips = (commentId: string) => useAllTips()?.[commentId]
