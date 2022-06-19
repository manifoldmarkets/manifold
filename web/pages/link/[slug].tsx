import { useRouter } from 'next/router'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { claimManalink } from 'web/lib/firebase/fn-call'
import { useManalink } from 'web/lib/firebase/manalinks'
import { ManalinkCard } from 'web/components/manalink-card'
import { useUser } from 'web/hooks/use-user'
import { useUserById } from 'web/hooks/use-users'
import { firebaseLogin } from 'web/lib/firebase/users'

export default function ClaimPage() {
  const user = useUser()
  const router = useRouter()
  const { slug } = router.query as { slug: string }
  const manalink = useManalink(slug)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const fromUser = useUserById(manalink?.fromId)
  if (!manalink) {
    return <></>
  }

  const info = { ...manalink, uses: manalink.claims.length }
  return (
    <>
      <SEO
        title="Send Mana"
        description="Send mana to anyone via link!"
        url="/send"
      />
      <div className="mx-auto max-w-xl">
        <Title text={`Claim ${manalink.amount} mana`} />
        <ManalinkCard
          defaultMessage={fromUser?.name || 'Enjoy this mana!'}
          info={info}
          isClaiming={claiming}
          onClaim={async () => {
            setClaiming(true)
            try {
              if (user == null) {
                await firebaseLogin()
              }
              const result = await claimManalink(manalink.slug)
              console.log(result)
              if (result.data.status == 'error') {
                throw new Error(result.data.message)
              }
              router.push('/account?claimed-mana=yes')
            } catch (e) {
              console.log(e)
              const message =
                e && e instanceof Object ? e.toString() : 'An error occurred.'
              setError(message)
            }
            setClaiming(false)
          }}
        />
        {error && (
          <section className="my-5 text-red-500">
            <p>Failed to claim manalink.</p>
            <p>{error}</p>
          </section>
        )}
      </div>
    </>
  )
}
