import clsx from 'clsx'
import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { copyToClipboard } from 'web/lib/util/copy'
import { linkTwitchAccount } from 'web/lib/twitch/link-twitch-account'
import { LinkIcon } from '@heroicons/react/solid'
import { track } from 'web/lib/service/analytics'
import { Button } from './../button'
import { LoadingIndicator } from './../loading-indicator'
import { Row } from './../layout/row'
import { usePrivateUser, useUser } from 'web/hooks/use-user'

export function TwitchPanel() {
  const user = useUser()
  const privateUser = usePrivateUser()

  const twitchName = privateUser?.twitchInfo?.twitchName
  const twitchToken = privateUser?.twitchInfo?.controlToken

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

    const promise = linkTwitchAccount(user, privateUser)
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
              <Button color="blue" size="lg" onClick={copyOverlayLink}>
                Copy overlay link
              </Button>
              <Button color="indigo" size="lg" onClick={copyDockLink}>
                Copy dock link
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
