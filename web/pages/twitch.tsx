import { LinkIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { PrivateUser, User } from 'common/user'
import Link from 'next/link'
import { MouseEventHandler, ReactNode, useState } from 'react'

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
import {
  firebaseLogin,
  getUserAndPrivateUser,
  updatePrivateUser,
} from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import {
  linkTwitchAccountRedirect,
  updateBotEnabledForUser,
} from 'web/lib/twitch/link-twitch-account'
import { copyToClipboard } from 'web/lib/util/copy'

function ButtonGetStarted(props: {
  user?: User | null
  privateUser?: PrivateUser | null
  buttonClass?: string
  spinnerClass?: string
}) {
  const { user, privateUser, buttonClass, spinnerClass } = props

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
  return isLoading ? (
    <LoadingIndicator
      spinnerClassName={clsx('!w-11 !h-11 my-4', spinnerClass)}
    />
  ) : (
    <Button
      size="xl"
      color="gradient"
      className={clsx('my-4 self-center !px-16', buttonClass)}
      onClick={getStarted}
    >
      Start playing
    </Button>
  )
}

function TwitchPlaysManifoldMarkets(props: {
  user?: User | null
  privateUser?: PrivateUser | null
}) {
  const { user, privateUser } = props

  const twitchUser = privateUser?.twitchInfo?.twitchName

  return (
    <div>
      <Row className="mb-4">
        <img
          src="/twitch-glitch.svg"
          className="mb-[0.4rem] mr-4 inline h-10 w-10"
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
          <Button
            size="xl"
            color="green"
            className="btn-disabled my-4 self-center !border-none"
          >
            Account connected: {twitchUser}
          </Button>
        ) : (
          <ButtonGetStarted user={user} privateUser={privateUser} />
        )}
        <div>
          Instead of Twitch channel points we use our play money, Mana (M$). All
          viewers start with M$1000 and more can be earned for free and then{' '}
          <Link href="/charity">
            <a className="underline">donated to a charity</a>
          </Link>{' '}
          of their choice at no cost!
        </div>
      </Col>
    </div>
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
    <div>
      <Title text="Twitch Chat Commands" className="md:block" />
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
    </div>
  )
}

function BotSetupStep(props: {
  stepNum: number
  buttonName?: string
  buttonOnClick?: MouseEventHandler
  overrideButton?: ReactNode
  children: ReactNode
}) {
  const { stepNum, buttonName, buttonOnClick, overrideButton, children } = props
  return (
    <Col className="flex-1">
      {(overrideButton || buttonName) && (
        <>
          {overrideButton ?? (
            <Button
              size={'md'}
              color={'green'}
              className="!border-none"
              onClick={buttonOnClick}
            >
              {buttonName}
            </Button>
          )}
          <Spacer h={4} />
        </>
      )}
      <div>
        <p className="inline font-bold">Step {stepNum}. </p>
        {children}
      </div>
    </Col>
  )
}

function BotConnectButton(props: {
  privateUser: PrivateUser | null | undefined
}) {
  const { privateUser } = props
  const [loading, setLoading] = useState(false)

  const updateBotConnected = (connected: boolean) => async () => {
    if (!privateUser) return
    const twitchInfo = privateUser.twitchInfo
    if (!twitchInfo) return

    const error = connected
      ? 'Failed to add bot to your channel'
      : 'Failed to remove bot from your channel'
    const success = connected
      ? 'Added bot to your channel'
      : 'Removed bot from your channel'

    setLoading(true)
    toast.promise(
      updateBotEnabledForUser(privateUser, connected)
        .then(() =>
          updatePrivateUser(privateUser.id, {
            twitchInfo: { ...twitchInfo, botEnabled: connected },
          })
        )
        .finally(() => setLoading(false)),
      { loading: 'Updating bot settings...', error, success },
      {
        loading: {
          className: '!max-w-sm',
        },
        success: {
          className:
            '!bg-primary !transition-all !duration-500 !text-white !max-w-sm',
        },
        error: {
          className:
            '!bg-red-400 !transition-all !duration-500 !text-white !max-w-sm',
        },
      }
    )
  }

  return (
    <>
      {privateUser?.twitchInfo?.botEnabled ? (
        <Button
          color="red"
          onClick={updateBotConnected(false)}
          className={clsx(loading && '!btn-disabled', '')}
        >
          {loading ? (
            <LoadingIndicator spinnerClassName="!h-5 !w-5 border-white !border-2" />
          ) : (
            'Remove bot from channel'
          )}
        </Button>
      ) : (
        <Button
          color="green"
          onClick={updateBotConnected(true)}
          className={clsx(loading && '!btn-disabled', '')}
        >
          {loading ? (
            <LoadingIndicator spinnerClassName="!h-5 !w-5 border-white !border-2" />
          ) : (
            'Add bot to your channel'
          )}
        </Button>
      )}
    </>
  )
}

function SetUpBot(props: {
  user?: User | null
  privateUser?: PrivateUser | null
}) {
  const { user, privateUser } = props
  const twitchLinked = privateUser?.twitchInfo?.twitchName
  const controlToken = privateUser?.twitchInfo?.controlToken

  const toastTheme = {
    className: '!bg-primary !text-white',
    icon: <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />,
  }
  const copyOverlayLink = async () => {
    copyToClipboard(`http://localhost:1000/overlay?t=${controlToken}`) //!!!TODO: Fix link
    toast.success('Overlay link copied!', toastTheme)
  }
  const copyDockLink = async () => {
    copyToClipboard(`http://localhost:1000/dock?t=${controlToken}`) //!!!TODO: Fix link
    toast.success('Dock link copied!', toastTheme)
  }

  return (
    <>
      <Title
        text={'Set up the bot for your own stream'}
        className={'!mb-4 md:block'}
      />
      <Col className="gap-4">
        <img
          src="https://raw.githubusercontent.com/PhilBladen/ManifoldTwitchIntegration/master/docs/OBS.png" // TODO: Copy this into the Manifold codebase public folder
          className="!-my-2"
        ></img>
        To add the bot to your stream make sure you have logged in then follow
        the steps below.
        {!twitchLinked && (
          <ButtonGetStarted
            user={user}
            privateUser={privateUser}
            buttonClass={'!my-0'}
            spinnerClass={'!my-0'}
          />
        )}
        <div className="flex flex-col gap-6 sm:flex-row">
          <BotSetupStep
            stepNum={1}
            overrideButton={<BotConnectButton privateUser={privateUser} />}
          >
            Use the button above to add the bot to your channel. Then mod it by
            typing in your Twitch chat: <b>/mod ManifoldBot</b>
            <br />
            If the bot is not modded it will not be able to respond to commands
            properly.
          </BotSetupStep>
          <BotSetupStep
            stepNum={2}
            buttonName={twitchLinked && 'Overlay link'}
            buttonOnClick={copyOverlayLink}
          >
            Create a new browser source in your streaming software such as OBS.
            Paste in the above link and resize it to your liking. We recommend
            setting the size to 400x400.
          </BotSetupStep>
          <BotSetupStep
            stepNum={3}
            buttonName={twitchLinked && 'Control dock link'}
            buttonOnClick={copyDockLink}
          >
            The bot can be controlled entirely through chat. But we made an easy
            to use control panel. Share the link with your mods or embed it into
            your OBS as a custom dock.
          </BotSetupStep>
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

      <Col className="max-w-3xl gap-8 rounded bg-white p-4 text-gray-600 shadow-md sm:mx-auto sm:p-10">
        <TwitchPlaysManifoldMarkets user={user} privateUser={privateUser} />
        <TwitchChatCommands />
        <SetUpBot privateUser={privateUser} />
      </Col>
    </Page>
  )
}
