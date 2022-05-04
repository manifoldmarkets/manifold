import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { useUser } from '../hooks/use-user'
import { createManalink } from '../lib/firebase/manalinks'

export default function SendPage() {
  const user = useUser()

  return (
    <Page>
      <SEO
        title="Send Mana"
        description="Send mana to anyone via link!"
        url="/send"
      />

      <h1>Send Mana</h1>
      {user && (
        <button
          className="btn"
          onClick={async () => {
            await createManalink({
              fromId: user.id,
              amount: 1234,
              expiresTime: Date.now() + 1000 * 60 * 60 * 24 * 7,
              maxUses: Infinity,
            })
          }}
        >
          Create a new Manalink
        </button>
      )}
    </Page>
  )
}
