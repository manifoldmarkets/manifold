import { useEffect } from 'gridjs'
import { Page } from '../components/page'
import { Title } from '../components/title'

export default function Custom404() {
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
          allowTransparency={true}
          frameBorder="0"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        ></iframe>
      </div>
    </Page>
  )
}
