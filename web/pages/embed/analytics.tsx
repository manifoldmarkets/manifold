import { FirstArgument } from 'common/util/types'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { fromPropz } from 'web/hooks/use-propz'
import Analytics, {
  CustomAnalytics,
  FirebaseAnalytics,
  getStaticPropz,
} from '../analytics'

export const getStaticProps = fromPropz(getStaticPropz)

export default function AnalyticsEmbed(props: FirstArgument<typeof Analytics>) {
  return (
    <Col className="w-full bg-white px-2">
      <CustomAnalytics {...props} />
      <Spacer h={8} />
      <FirebaseAnalytics />
    </Col>
  )
}
