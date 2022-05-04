import { useState } from 'react'
import { Col } from '../components/layout/col'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'
import { createManalink } from '../lib/firebase/manalinks'

export default function SendPage() {
  const user = useUser()
  const [amount, setAmount] = useState(100)

  return (
    <Page>
      <SEO
        title="Send Mana"
        description="Send mana to anyone via link!"
        url="/send"
      />

      <Col className="gap-4">
        <Title text="Send mana" />

        {/* Add a input form to set the amount */}
        <label>
          Amount M$
          <input
            className="input"
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value))}
          />
        </label>

        {user && (
          <button
            className="btn"
            onClick={async () => {
              await createManalink({
                fromId: user.id,
                amount: amount,
                expiresTime: Date.now() + 1000 * 60 * 60 * 24 * 7,
                maxUses: Infinity,
              })
            }}
          >
            Create a new Manalink
          </button>
        )}
      </Col>

      {/* TODO: show referral links via TailwindUI Table https://tailwindui.com/components/application-ui/lists/tables */}
    </Page>
  )
}
