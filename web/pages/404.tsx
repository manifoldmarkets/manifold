import { Page } from '../components/page'
import { Title } from '../components/title'

export default function Custom404() {
  // Get the current URL from the window
  const url = window.location.href

  return (
    <Page>
      <div className="flex flex-col items-center justify-center h-full">
        <Title text="404: Oops!" />
        <p>
          Nothing exists at
          <span className="p-2 font-mono">{url}</span>
        </p>
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
