import { useState } from 'react'

import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'
import { Spacer } from 'web/components/layout/spacer'
import { firebaseLogin, getUserAndPrivateUser } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/button'
import { useTracking } from 'web/hooks/use-tracking'
import { linkTwitchAccountRedirect } from 'web/lib/twitch/link-twitch-account'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/loading-indicator'
import toast from 'react-hot-toast'

export default function TwitchLandingPage() {
  useSaveReferral()
  useTracking('view twitch landing page')

  const user = useUser()
  const privateUser = usePrivateUser()
  const twitchUser = privateUser?.twitchInfo?.twitchName

  const callback =
    user && privateUser
      ? () => linkTwitchAccountRedirect(user, privateUser)
      : async () => {
          const result = await firebaseLogin()

          const userId = result.user.uid
          const { user, privateUser } = await getUserAndPrivateUser(userId)
          if (!user || !privateUser) return

          await linkTwitchAccountRedirect(user, privateUser)
        }

  const [isLoading, setLoading] = useState(false)

  const getStarted = async () => {
    try {
      setLoading(true)

      const promise = callback()
      track('twitch page button click')
      await promise
    } catch (e) {
      console.error(e)
      toast.error('Failed to sign up. Please try again later.')
      setLoading(false)
    }
  }

  return (
    <Page>
      <SEO
        title="Manifold Markets on Twitch"
        description="Get more out of Twitch with play-money betting markets."
      />
      <div className="px-4 pt-2 md:mt-0 lg:hidden">
        <ManifoldLogo />
      </div>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <Col className="mb-6 rounded-xl sm:m-12 sm:mt-0">
            <Row className="self-center">
              <img height={200} width={200} src="/twitch-logo.png" />
              <img height={200} width={200} src="/flappy-logo.gif" />
            </Row>
            <div className="m-4 max-w-[550px] self-center">
              <h1 className="text-3xl sm:text-6xl xl:text-6xl">
                <div className="font-semibold sm:mb-2">
                  <span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text font-bold text-transparent">
                    Bet
                  </span>{' '}
                  on your favorite streams
                </div>
              </h1>
              <Spacer h={6} />
              <div className="mb-4 px-2 ">
                Get more out of Twitch with play-money betting markets.{' '}
                {!twitchUser &&
                  'Click the button below to link your Twitch account.'}
                <br />
              </div>
            </div>

            <Spacer h={6} />

            {twitchUser ? (
              <div className="mt-3 self-center rounded-lg bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-400 p-4 ">
                <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                  <div className="truncate text-sm font-medium text-gray-500">
                    Twitch account linked
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">
                    {twitchUser}
                  </div>
                </div>
              </div>
            ) : isLoading ? (
              <LoadingIndicator spinnerClassName="!w-16 !h-16" />
            ) : (
              <Button
                size="2xl"
                color="gradient"
                className="self-center"
                onClick={getStarted}
              >
                Get started
              </Button>
            )}
          </Col>
        </Col>
      </Col>
    </Page>
  )
}
