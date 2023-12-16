import { Metadata } from 'next'
import Link from 'next/link'
import { PoliticsPage } from 'politics/components/politics-page'

export const metadata: Metadata = {
  title: 'Next.js',
}

export default function Page() {
  return (
    <PoliticsPage trackPageView={'home'}>
      I am a page
      <Link href={'/Dashboard'}>Dashboard</Link>
    </PoliticsPage>
  )
}
