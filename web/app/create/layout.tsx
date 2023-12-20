import { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Create a question',
  description: 'Create a play-money prediction market on any question.',
  openGraph: {
    url: '/create',
  },
}
export default function Page({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
