import { useRouter } from 'next/router'
import { useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { claimManalink } from 'web/lib/firebase/api'
import { useManalink } from 'web/lib/firebase/manalinks'
import { ManalinkCard } from 'web/components/manalink-card'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/button'

export default function ClaimPage() {
  const user = useUser()
  const router = useRouter()
  const { slug } = router.query as { slug: string }
  const manalink = useManalink(slug)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

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
      <div className="mx-auto max-w-xl px-2">
        <Row className="items-center justify-between">
          <Title text={`Claim M$${manalink.amount} mana`} />
          <div className="my-auto">
            <Button
              onClick={async () => {
                setClaiming(true)
                try {
                  if (user == null) {
                    await firebaseLogin()
                    setClaiming(false)
                    return
                  }
                  if (user?.id == manalink.fromId) {
                    throw new Error("You can't claim your own manalink.")
                  }
                  await claimManalink({ slug: manalink.slug })
                  user && router.push(`/${user.username}?claimed-mana=yes`)
                } catch (e) {
                  console.log(e)
                  const message =
                    e && e instanceof Object
                      ? e.toString()
                      : 'An error occurred.'
                  setError(message)
                }
                setClaiming(false)
              }}
              disabled={claiming}
              size="lg"
            >
              {user ? 'Claim' : 'Login'}
            </Button>
          </div>
        </Row>
        <ManalinkCard info={info} />
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
