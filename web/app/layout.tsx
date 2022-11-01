import 'tailwindcss/tailwind.css'

import Head from 'next/head'
import { AuthProvider } from 'web/components/auth-context'

export default function RootLayout({
  // Layouts must accept a children prop.
  // This will be populated with nested layouts or pages
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <Head>
        <title>Next.js</title>
      </Head>
      <body>
        {/* Note: missing the serverUser optimization? */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
