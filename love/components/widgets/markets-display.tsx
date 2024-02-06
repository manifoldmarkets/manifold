import { Lover } from 'common/love/lover'
import { Col } from 'web/components/layout/col'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export const MarketsDisplay = ({ lover }: { lover: Lover }) => {
  const { data } = useAPIGetter('get-love-market', { userId: lover.user_id })
  
  console.log('got data', data)
  return <Col>

  </Col>
}
