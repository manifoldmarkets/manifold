import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { Page } from 'web/components/layout/page'

export default function Custom404(props: { customText?: string }) {
  if (IS_PRIVATE_MANIFOLD) {
    // Since private Manifolds are client-side rendered, they'll blink the 404
    // So we just show a blank page here:
    return <Page></Page>
  }
  return <div>our db is down</div>
}
