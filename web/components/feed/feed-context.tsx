import { createContext, ReactNode, useContext } from 'react'
import { CommentTipMap, useTipTxns } from 'web/hooks/use-tip-txns'

const FeedContext = createContext<CommentTipMap | null | undefined>(null)

export function FeedContextProvider(props: {
  contractId: string
  children: ReactNode
}) {
  const { contractId, children } = props
  const value = useTipTxns(contractId)

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>
}

const useContractTips = () => useContext(FeedContext)

export const useCommentTips = (commentId: string) =>
  useContractTips()?.[commentId]
