import { JSONContent } from '@tiptap/core'
import { useContract } from 'web/hooks/use-contract-supabase'
import { useUserById } from 'web/hooks/use-user-supabase'
import { ContractMention } from '../contract/contract-mention'
import { Col } from '../layout/col'
import { RelativeTimestamp } from '../relative-timestamp'
import { Avatar } from '../widgets/avatar'
import { Content } from '../widgets/editor'
import { UserLink } from '../widgets/user-link'
import { StarDisplay } from './stars'

export const Review = (props: {
  userId: string
  rating: number
  created: number
  contractId: string
  text?: JSONContent
}) => {
  const { rating, created, text } = props
  const user = useUserById(props.userId)
  const contract = useContract(props.contractId)

  if (!user || !contract) return null

  return (
    <div className="py-6 first:pt-0 last:pb-0">
      <Col className="items-start">
        <div className="mb-1 flex items-center gap-3">
          <Avatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size="xs"
          />
          <UserLink
            name={user.name}
            username={user.username}
            className="text-ink-500"
          />
        </div>
        <div className="-ml-0.5 -mb-1 space-x-2">
          <StarDisplay rating={rating} />
          <ContractMention contract={contract} />
        </div>
        <RelativeTimestamp time={created} className="-ml-1" />
      </Col>
      {text && <Content content={text} size="sm" className="mt-2" />}
    </div>
  )
}
