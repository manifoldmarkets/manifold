import { PrivateUser, User } from 'common/user'
import Link from 'next/link'
import { useState } from 'react'

import toast from 'react-hot-toast'
import { Button } from 'web/components/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { firebaseLogin, getUserAndPrivateUser } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { linkTwitchAccountRedirect } from 'web/lib/twitch/link-twitch-account'

function TwitchPlaysManifoldMarkets(props: {
  user?: User | null
  privateUser?: PrivateUser | null
}) {
  const { user, privateUser } = props

  const twitchUser = privateUser?.twitchInfo?.twitchName

  const [isLoading, setLoading] = useState(false)

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
    <>
      <Row className="mb-4 items-end">
        <img
          src="/twitch-glitch.svg"
          className="mb-[0.4rem] mr-2 inline h-10 w-10"
        ></img>
        <Title
          text={'Twitch plays Manifold Markets'}
          className={'!-my-0 md:block'}
        />
      </Row>
      <Col className="gap-4">
        <div>
          Similar to Twitch channel point predictions, Manifold Markets allows
          you to create and feature on stream any question you like with users
          predicting to earn play money.
        </div>
        <div>
          The key difference is that Manifold's questions function more like a
          stock market and viewers can buy and sell shares over the course of
          the event and not just at the start. The market will eventually
          resolve to yes or no at which point the winning shareholders will
          receive their profit.
        </div>
        Start playing now by logging in with Google and typing commands in chat!
        {twitchUser ? (
          <Button size="xl" color="green" className="btn-disabled self-center">
            Account connected: {twitchUser}
          </Button>
        ) : isLoading ? (
          <LoadingIndicator spinnerClassName="!w-11 !h-11" />
        ) : (
          <Button
            size="xl"
            color="gradient"
            className="self-center !px-16"
            onClick={getStarted}
          >
            Start playing
          </Button>
        )}
        <div>
          Instead of Twitch channel points we use our play money, mana (m$). All
          viewers start with M$1000 and more can be earned for free and then{' '}
          <Link href="/charity" className="underline">
            donated to a charity
          </Link>{' '}
          of their choice at no cost!
        </div>
      </Col>
    </>
  )
}

function Subtitle(props: { text: string }) {
  const { text } = props
  return <div className="text-2xl">{text}</div>
}

function Command(props: { command: string; desc: string }) {
  const { command, desc } = props
  return (
    <div>
      <p className="inline font-bold">{'!' + command}</p>
      {' - '}
      <p className="inline">{desc}</p>
    </div>
  )
}

function TwitchChatCommands() {
  return (
    <>
      <Title text={'Twitch Chat Commands'} className={'md:block'} />
      <Col className="gap-4">
        <Subtitle text="For Chat" />
        <Command command="bet yes#" desc="Bets a # of Mana on yes." />
        <Command command="bet no#" desc="Bets a # of Mana on no." />
        <Command
          command="sell"
          desc="Sells all shares you own. Using this command causes you to
          cash out early before the market resolves. This could be profitable
          (if the probability has moved towards the direction you bet) or cause
          a loss, although at least you keep some Mana. For maximum profit (but
          also risk) it is better to not sell and wait for a favourable
          resolution."
        />
        <Command command="balance" desc="Shows how much Mana you own." />
        <Command command="allin yes" desc="Bets your entire balance on yes." />
        <Command command="allin no" desc="Bets your entire balance on no." />

        <Subtitle text="For Mods/Streamer" />
        <Command
          command="create <question>"
          desc="Creates and features the question. Be careful... this will override any question that is currently featured."
        />
        <Command command="resolve yes" desc="Resolves the market as 'Yes'." />
        <Command command="resolve no" desc="Resolves the market as 'No'." />
        <Command
          command="resolve n/a"
          desc="Resolves the market as 'N/A' and refunds everyone their Mana."
        />
      </Col>
    </>
  )
}

function BotSetupStep(props: {
  stepNum: number
  buttonName?: string
  text: string
}) {
  const { stepNum, buttonName, text } = props
  return (
    <Col className="flex-1">
      {buttonName && (
        <>
          <Button color="green">{buttonName}</Button>
          <Spacer h={4} />
        </>
      )}
      <div>
        <p className="inline font-bold">Step {stepNum}. </p>
        {text}
      </div>
    </Col>
  )
}

function SetUpBot(props: { privateUser?: PrivateUser | null }) {
  const { privateUser } = props
  const twitchLinked = privateUser?.twitchInfo?.twitchName
  return (
    <>
      <Title
        text={'Set up the bot for your own stream'}
        className={'!mb-4 md:block'}
      />
      <Col className="gap-4">
        <img
          src="https://raw.githubusercontent.com/PhilBladen/ManifoldTwitchIntegration/master/docs/OBS.png"
          className="!-my-2"
        ></img>
        To add the bot to your stream make sure you have logged in then follow
        the steps below.
        {!twitchLinked && (
          <Button
            size="xl"
            color="gradient"
            className="self-center !px-16"
            // onClick={getStarted}
          >
            Start playing
          </Button>
        )}
        <div className="flex flex-col gap-6 sm:flex-row">
          <BotSetupStep
            stepNum={1}
            buttonName={twitchLinked && 'Add bot to channel'}
            text="Use the button above to add the bot to your channel. Then mod it by typing in your Twitch chat: /mod ManifoldBot (or whatever you named the bot) If the bot is modded it will not work properly on the backend."
          />
          <BotSetupStep
            stepNum={2}
            buttonName={twitchLinked && 'Overlay link'}
            text="Create a new browser source in your streaming software such as OBS. Paste in the above link and resize it to your liking. We recommend setting the size to 400x400."
          />
          <BotSetupStep
            stepNum={3}
            buttonName={twitchLinked && 'Control dock link'}
            text="The bot can be controlled entirely through chat. But we made an easy to use control panel. Share the link with your mods or embed it into your OBS as a custom dock."
          />
        </div>
      </Col>
    </>
  )
}

export default function TwitchLandingPage() {
  useSaveReferral()
  useTracking('view twitch landing page')

  const user = useUser()
  const privateUser = usePrivateUser()

  return (
    <Page>
      <SEO
        title="Manifold Markets on Twitch"
        description="Get more out of Twitch with play-money betting markets."
      />
      <div className="px-4 pt-2 md:mt-0 lg:hidden">
        <ManifoldLogo />
      </div>
      {/* <Col className="items-center">
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
      </Col> */}

      <Col className="max-w-3xl rounded bg-white p-10 text-gray-600 shadow-md sm:mx-auto">
        <TwitchPlaysManifoldMarkets user={user} privateUser={privateUser} />
        <TwitchChatCommands />
        <SetUpBot privateUser={privateUser} />
      </Col>
    </Page>
  )
}
