import { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Manifold Politics user notifications',
}
export default function Page({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
