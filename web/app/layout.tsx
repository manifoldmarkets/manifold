import 'tailwindcss/tailwind.css'

import Head from 'next/head'

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
      <body>{children}</body>
    </html>
  )
}
