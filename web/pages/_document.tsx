import { Html, Head, Main, NextScript } from 'next/document'
import { ENV_CONFIG } from 'common/envs/constants'

// Sets the "dark" class from the user's theme preference before the page is painted.
// This must be a plain inline <script>: next/script's beforeInteractive strategy
// adds `defer` to scripts with a src, so the page can paint in light theme first.
// Keep in sync with use-theme.tsx.
const initThemeScript = `
try {
  const autoDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const localTheme = localStorage.getItem('theme')
  const theme = localTheme ? JSON.parse(localTheme) : 'auto'

  if (theme === 'dark' || (theme !== 'light' && autoDark)) {
    document.documentElement.classList.add('dark')
  }
} catch (e) {}
`

export default function Document() {
  return (
    <Html lang="en" className="font-figtree font-normal">
      {/* Prevent flash of light theme before stylesheet loads. See use-theme.ts */}
      <style>
        {`@media (prefers-color-scheme: dark) {
            :root {
              color-scheme: dark;
              background-color: rgb(15 23 41);
              color: white;
            }
          }`}
      </style>
      <Head>
        <link rel="icon" href={ENV_CONFIG.faviconPath} />
        <script dangerouslySetInnerHTML={{ __html: initThemeScript }} />
      </Head>
      <body className="bg-canvas-0 text-ink-1000">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
