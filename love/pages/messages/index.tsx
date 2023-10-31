import { LovePage } from 'love/components/love-page'

export default function MessagesPage() {
  return (
    <LovePage trackPageView={'messages page'} className={'p-2'}>
      <MessagesPage />
    </LovePage>
  )
}
