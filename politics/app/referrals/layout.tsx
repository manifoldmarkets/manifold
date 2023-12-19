import { Metadata } from 'next'
import { formatMoney } from 'common/util/format'
import { REFERRAL_AMOUNT } from 'common/economy'
export const metadata: Metadata = {
  title: 'Earn mana by referring friends!',
  description: `Invite someone to join Manifold Politics and get ${formatMoney(
    REFERRAL_AMOUNT
  )} if they sign up!`,
}

export default function Page({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
