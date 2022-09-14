import clsx from 'clsx'
import { MouseEventHandler, ReactNode, useState } from 'react'
import toast from 'react-hot-toast'

import { LinkIcon } from '@heroicons/react/solid'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import {
  linkTwitchAccountRedirect,
  updateBotEnabledForUser,
} from 'web/lib/twitch/link-twitch-account'
import { copyToClipboard } from 'web/lib/util/copy'
import { Button, ColorType } from './../button'
import { Row } from './../layout/row'
import { LoadingIndicator } from './../loading-indicator'
import { PrivateUser } from 'common/user'

function BouncyButton(props: {
  children: ReactNode
  onClick?: MouseEventHandler<any>
  color?: ColorType
  className?: string
}) {
  const { children, onClick, color, className } = props
  return (
    <Button
      color={color}
      size="lg"
      onClick={onClick}
      className={clsx(
        'btn h-[inherit] flex-shrink-[inherit] border-none font-normal normal-case',
        className
      )}
    >
      {children}
    </Button>
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
      updateBotEnabledForUser(privateUser, connected).then(() =>
        updatePrivateUser(privateUser.id, {
          twitchInfo: { ...twitchInfo, botEnabled: connected },
        })
      ),
      { loading: 'Updating bot settings...', error, success }
    )
    try {
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {privateUser?.twitchInfo?.botEnabled ? (
        <BouncyButton
          color="red"
          onClick={updateBotConnected(false)}
          className={clsx(loading && 'btn-disabled')}
        >
          Remove bot from your channel
        </BouncyButton>
      ) : (
        <BouncyButton
          color="green"
          onClick={updateBotConnected(true)}
          className={clsx(loading && 'btn-disabled')}
        >
          Add bot to your channel
        </BouncyButton>
      )}
    </>
  )
}

export function TwitchPanel() {
  const user = useUser()
  const privateUser = usePrivateUser()

  const twitchInfo = privateUser?.twitchInfo
  const twitchName = twitchInfo?.twitchName
  const twitchToken = twitchInfo?.controlToken

  const linkIcon = <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />

  const copyOverlayLink = async () => {
    copyToClipboard(`http://localhost:1000/overlay?t=${twitchToken}`)
    toast.success('Overlay link copied!', {
      icon: linkIcon,
    })
  }

  const copyDockLink = async () => {
    copyToClipboard(`http://localhost:1000/dock?t=${twitchToken}`)
    toast.success('Dock link copied!', {
      icon: linkIcon,
    })
  }

  const [twitchLoading, setTwitchLoading] = useState(false)

  const createLink = async () => {
    if (!user || !privateUser) return
    setTwitchLoading(true)

    const promise = linkTwitchAccountRedirect(user, privateUser)
    track('link twitch from profile')
    await promise

    setTwitchLoading(false)
  }

  return (
    <>
      <div>
        <label className="label">Twitch</label>

        {!twitchName ? (
          <Row>
            <Button
              color="indigo"
              onClick={createLink}
              disabled={twitchLoading}
            >
              Link your Twitch account
            </Button>
            {twitchLoading && <LoadingIndicator className="ml-4" />}
          </Row>
        ) : (
          <Row>
            <span className="mr-4 text-gray-500">Linked Twitch account</span>{' '}
            {twitchName}
          </Row>
        )}
      </div>

      {twitchToken && (
        <div>
          <div className="flex w-full">
            <div
              className={clsx(
                'flex grow gap-4',
                twitchToken ? '' : 'tooltip tooltip-top'
              )}
              data-tip="You must link your Twitch account first"
            >
              <BouncyButton color="blue" onClick={copyOverlayLink}>
                Copy overlay link
              </BouncyButton>
              <BouncyButton color="indigo" onClick={copyDockLink}>
                Copy dock link
              </BouncyButton>
            </div>
          </div>
          <div className="mt-4" />
          <div className="flex w-full">
            <BotConnectButton privateUser={privateUser} />
          </div>
        </div>
      )}
    </>
  )
}
