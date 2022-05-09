import { useRouter } from 'next/router'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { claimManalink } from 'web/lib/firebase/api-call'
import { useManalink } from 'web/lib/firebase/manalinks'

export default function ClaimPage() {
  const router = useRouter()
  const { slug } = router.query as { slug: string }
  const manalink = useManalink(slug)

  if (!manalink) {
    return <></>
  }

  return (
    <Page>
      <SEO
        title="Send Mana"
        description="Send mana to anyone via link!"
        url="/send"
      />
      <Title text={`Claim ${manalink.amount} mana`} />
      <p>
        You can claim {manalink.amount} mana from {manalink.fromId} by clicking
        the button below.
      </p>
      <button
        className="btn"
        onClick={async () => {
          await claimManalink(manalink.slug)
        }}
      >
        Claim
      </button>
    </Page>
  )
}
