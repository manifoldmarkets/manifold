import clsx from 'clsx'
import React, { MouseEventHandler, ReactNode, useState } from 'react'
import toast from 'react-hot-toast'

import { copyToClipboard } from 'web/lib/util/copy'
import { linkTwitchAccountRedirect } from 'web/lib/twitch/link-twitch-account'
import { LinkIcon } from '@heroicons/react/solid'
import { track } from 'web/lib/service/analytics'
import { Button, ColorType } from './../button'
import { LoadingIndicator } from './../loading-indicator'
import { Row } from './../layout/row'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { deleteField } from 'firebase/firestore'

function BouncyButton(props: {
  children: ReactNode
  onClick?: MouseEventHandler<any>
  color?: ColorType
}) {
  const { children, onClick, color } = props
  return (
    <Button
      color={color}
      size="lg"
      onClick={onClick}
      className="btn h-[inherit] flex-shrink-[inherit] border-none font-normal normal-case"
    >
      {children}
    </Button>
  )
}

export function TwitchPanel() {
  const user = useUser()
  const privateUser = usePrivateUser()

  const twitchInfo = privateUser?.twitchInfo
  const twitchName = privateUser?.twitchInfo?.twitchName
  const twitchToken = privateUser?.twitchInfo?.controlToken
  const twitchBotConnected = privateUser?.twitchInfo?.botEnabled

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

  const updateBotConnected = (connected: boolean) => async () => {
    if (user && twitchInfo) {
      twitchInfo.botEnabled = connected
      await updatePrivateUser(user.id, { twitchInfo })
    }
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
              {twitchBotConnected ? (
                <BouncyButton color="red" onClick={updateBotConnected(false)}>
                  Remove bot from your channel
                </BouncyButton>
              ) : (
                <BouncyButton color="green" onClick={updateBotConnected(true)}>
                  Add bot to your channel
                </BouncyButton>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
