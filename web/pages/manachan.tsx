import { useState } from 'react'
import Image from 'next/image'
import TwitterLogo from 'web/lib/icons/twitter-logo'

import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { tweetFromManaChan } from 'web/lib/firebase/api'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { formatMoney } from 'common/util/format'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { SiteLink } from 'web/components/widgets/site-link'
import { MANACHAN_TWEET_COST } from 'common/economy'

export default function ManachanPage() {
  useTracking('view manachan page')

  const [tweet, setTweet] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSucess] = useState(false)
  const [error, setError] = useState(false)

  const user = useUser()

  const submit = async () => {
    setSucess(false)
    setError(false)

    if (!tweet.trim()) return
    if (!user) {
      firebaseLogin()
      return
    }

    setLoading(true)

    await tweetFromManaChan({ tweet })
      .then(() => setSucess(true))
      .catch(() => setError(true))

    track('buy manachan tweet', { tweet })

    setLoading(false)
    setTweet('')
  }

  return (
    <Page>
      <SEO
        title="Mana-chan speaks!"
        description="Mana-chan is Manifold's official anime spokesgirl"
        image="/manachan.png"
      />

      <Col className="bg-canvas-0 mx-auto max-w-[700px] gap-4 rounded p-4 py-8 sm:p-8 sm:shadow-md">
        <Title>Mana-chan speaks!</Title>
        <Image
          src="/manachan.png"
          width={300}
          height={300}
          alt={''}
          className="self-center"
        />
        <div>
          Mana-chan is Manifold's official anime spokesgirl...but she is very
          shy and doesn't know what to say. For{' '}
          {formatMoney(MANACHAN_TWEET_COST)}, you can tell her what to{' '}
          <SiteLink href="https://twitter.com/manachan_waifu" followsLinkClass>
            tweet
          </SiteLink>
          !
        </div>
        <ExpandingInput
          placeholder="Your tweet"
          autoFocus
          rows={3}
          maxLength={280}
          value={tweet}
          disabled={loading}
          onChange={(e) => setTweet(e.target.value || '')}
        />
        <Button
          color="gradient-pink"
          size="2xl"
          disabled={loading}
          onClick={submit}
        >
          {loading && <LoadingIndicator className="mr-2" />} Tweet for{' '}
          {formatMoney(MANACHAN_TWEET_COST)}
        </Button>
        {success && <div className="text-green-500">Tweet sent!</div>}
        {error && <div className="text-green-500">Error sending tweet</div>}
        <div className="text-xs">
          Mana-chan is a very sensitive girl who does not like mean or offensive
          tweets. Please be nice to her! If your post makes Mana-chan cry, we
          will delete it and no refund will be given.
        </div>
        <SiteLink
          className="flex items-center"
          href="https://twitter.com/manachan_waifu"
          followsLinkClass
        >
          <TwitterLogo className="mr-1 h-5 w-5" /> See Mana-chan's tweets
        </SiteLink>
      </Col>
    </Page>
  )
}
