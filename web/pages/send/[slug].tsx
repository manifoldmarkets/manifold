import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { claimManalink } from 'web/lib/firebase/api-call'
import { useManalink } from 'web/lib/firebase/manalinks'
import { fromNow } from 'web/lib/util/time'

export default function ClaimPage() {
  const router = useRouter()
  const { slug } = router.query as { slug: string }
  const manalink = useManalink(slug)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<Error | null>(null)

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
      <Col className="mx-auto max-w-xl gap-2">
        <Title text={`Claim ${manalink.amount} mana`} />

        <div className="min-h-20 group m-4 flex flex-col rounded-xl bg-gradient-to-br from-indigo-200 via-indigo-400 to-indigo-800 shadow-lg transition-all">
          <Col className="mx-4 mt-2 -mb-4 text-right text-sm text-gray-100">
            <div>4 uses left</div>
            <div>Expires {fromNow(manalink.expiresTime)}</div>
          </Col>

          <img
            className="mb-6 block self-center transition-all group-hover:rotate-12"
            src="/logo-white.svg"
            width={200}
            height={200}
          />
          <Row className="justify-end rounded-b-xl bg-white p-4">
            <Col>
              <div className="mb-1 text-xl text-indigo-500">
                {formatMoney(manalink.amount)}
              </div>
              <div>From Austin</div>
            </Col>

            <div className="ml-auto">
              <button
                className={clsx('btn', claiming ? 'loading disabled' : '')}
                onClick={async () => {
                  setClaiming(true)
                  const result = await claimManalink(manalink.slug)
                  // TODO: show confetti if success, error if failure

                  // Wait 1.5 more sec, to feel like it's doing work
                  await new Promise((resolve) => setTimeout(resolve, 1500))
                  setClaiming(false)
                }}
              >
                {claiming ? '' : 'Claim'}
              </button>
            </div>
          </Row>
        </div>
      </Col>
    </Page>
  )
}
