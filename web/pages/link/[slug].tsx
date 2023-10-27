import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { claimManalink } from 'web/lib/firebase/api'
import { getManalink } from 'web/lib/supabase/manalinks'
import { ManalinkCard } from 'web/components/manalink-card'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, getUser } from 'web/lib/firebase/users'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { User } from 'common/user'
import { Manalink } from 'common/manalink'
import { ENV_CONFIG } from 'common/envs/constants'
import { Page } from 'web/components/layout/page'
import { formatMoney } from 'common/util/format'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'

export const getServerSideProps = redirectIfLoggedOut(
  '/',
  async (ctx, creds) => {
    const slug = ctx.params?.slug
    if (!slug || typeof slug !== 'string') {
      return { notFound: true }
    }
    const adminDb = await initSupabaseAdmin()
    const [auth, manalink] = await Promise.all([
      getUserAndPrivateUser(creds.uid),
      getManalink(slug, adminDb),
    ])
    if (manalink == null) {
      return { notFound: true }
    }
    return { props: { auth, manalink } }
  }
)

export default function ClaimPage(props: { manalink: Manalink }) {
  const { manalink } = props
  const user = useUser()
  const router = useRouter()
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useReferral(user, manalink)

  const info = { ...manalink, uses: manalink.claims.length }
  return (
    <Page trackPageView={'manalink slug page'}>
      <SEO
        title="Send Mana"
        description="Send mana to anyone via link!"
        url="/send"
      />
      <div className="mx-auto max-w-xl px-2">
        <Row className="items-center justify-between">
          <Title>Claim {formatMoney(manalink.amount)} mana </Title>
          <div className="my-auto"></div>
        </Row>

        <ManalinkCard info={info} />

        {error && (
          <section className="text-scarlet-500 my-5">
            <p>Failed to claim manalink.</p>
            <p>{error}</p>
          </section>
        )}

        <Row className="items-center">
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
                  e && e instanceof Object ? e.toString() : 'An error occurred.'
                setError(message)
              }
              setClaiming(false)
            }}
            disabled={claiming}
            size="lg"
          >
            {user
              ? `Claim ${ENV_CONFIG.moneyMoniker}${manalink.amount}`
              : 'Login to claim'}
          </Button>
        </Row>
      </div>
    </Page>
  )
}

const useReferral = (user: User | undefined | null, manalink: Manalink) => {
  const [creator, setCreator] = useState<User | undefined>(undefined)

  useEffect(() => {
    getUser(manalink.fromId).then(setCreator)
  }, [manalink])

  useSaveReferral(user, { defaultReferrerUsername: creator?.username })
}
