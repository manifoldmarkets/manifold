import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { Page } from '../components/page'
import { Title } from '../components/title'

export default function Custom404() {
  if (IS_PRIVATE_MANIFOLD) {
    // Since private Manifolds are client-side rendered, they'll blink the 404
    // So we just show a blank page here:
    return <Page></Page>
  }
  return (
    <Page>
      <div className="flex h-full flex-col items-center justify-center">
        <Title text="404: Oops!" />
        <p>Nothing exists at this location.</p>
        <p>If you didn't expect this, let us know on Discord!</p>
        <br />
        <iframe
          src="https://discord.com/widget?id=915138780216823849&theme=dark"
          width="350"
          height="500"
          frameBorder="0"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        ></iframe>
      </div>
    </Page>
  )
}
