import { useRouter } from 'next/router'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { claimManalink } from 'web/lib/firebase/fn-call'
import { useManalink } from 'web/lib/firebase/manalinks'
import { ManalinkCard } from 'web/components/manalink-card'
import { useUserById } from 'web/hooks/use-users'

export default function ClaimPage() {
  const router = useRouter()
  const { slug } = router.query as { slug: string }
  const manalink = useManalink(slug)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fromUser = useUserById(manalink?.fromId)
  if (!manalink) {
    return <></>
  }

  const info = { ...manalink, uses: manalink.claims.length }
  return (
    <Page>
      <SEO
        title="Send Mana"
        description="Send mana to anyone via link!"
        url="/send"
      />
      <Col className="mx-auto max-w-xl gap-2">
        <Title text={`Claim ${manalink.amount} mana`} />
        <ManalinkCard
          className="m-4"
          defaultMessage={fromUser?.name || 'Enjoy this mana!'}
          info={info}
          isClaiming={claiming}
          onClaim={async () => {
            setClaiming(true)
            await claimManalink(manalink.slug)
            // TODO: show confetti if success, error if failure

            // Wait 1.5 more sec, to feel like it's doing work
            await new Promise((resolve) => setTimeout(resolve, 1500))
            setClaiming(false)
          }}
        />
      </Col>
    </Page>
  )
}
