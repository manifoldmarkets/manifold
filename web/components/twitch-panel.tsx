import clsx from 'clsx'
import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { copyToClipboard } from 'web/lib/util/copy'
import { initLinkTwitchAccount } from 'web/lib/twitch/link-twitch-account'
import { LinkIcon } from '@heroicons/react/solid'
import { User, PrivateUser } from 'common/user'

export function TwitchPanel(props: {
  auth: { user: User; privateUser: PrivateUser }
}) {
  const { user, privateUser } = props.auth

  const [twitchToken, setTwitchToken] = useState('')
  const [twitchLoading, setTwitchLoading] = useState(false)
  const [twitchLinkError, setTwitchLinkError] = useState('')
  const [controlToken, setControlToken] = useState<string | undefined>(
    undefined
  )

  const linkTwitchAccount = async () => {
    if (!privateUser.apiKey) return // TODO: handle missing API key
    try {
      setTwitchLoading(true)
      const [twitchAuthURL, linkSuccessPromise] = await initLinkTwitchAccount(
        privateUser.id,
        privateUser.apiKey
      )
      window.open(twitchAuthURL)
      const data = await linkSuccessPromise
      setTwitchToken(data.twitchName)
      setControlToken(data.controlToken)
    } catch (e) {
      console.error(e)
      toast.error('Failed to link Twitch account: ' + (e as Object).toString())
    } finally {
      setTwitchLoading(false)
    }
  }

  const linkIcon = <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />
  const copyOverlayLink = async () => {
    copyToClipboard(`http://localhost:1000/overlay?t=${controlToken}`)
    toast.success('Overlay link copied!', {
      icon: linkIcon,
    })
  }
  const copyDockLink = async () => {
    copyToClipboard(`http://localhost:1000/dock?t=${controlToken}`)
    toast.success('Dock link copied!', {
      icon: linkIcon,
    })
  }

  return (
    <>
      <div>
        <label className="label">Twitch</label>
        <div className="relative flex w-full justify-items-stretch">
          <input
            type="text"
            placeholder="Click link to connect your Twitch account"
            className="input input-bordered w-full"
            value={twitchToken}
            readOnly
            style={{
              borderTopRightRadius: '0',
              borderBottomRightRadius: '0',
            }}
          />
          <button
            className={clsx(
              'btn btn-secondary btn-square p-2',
              twitchLoading ? 'loading' : ''
            )}
            onClick={linkTwitchAccount}
            style={{
              borderTopLeftRadius: '0',
              borderBottomLeftRadius: '0',
            }}
          >
            {!twitchLoading && <LinkIcon />}
          </button>
        </div>
      </div>

      <span className="text-sm text-red-400">Not editable for now</span>

      <div>
        <div className="flex w-full">
          <div
            className={clsx(
              'flex grow gap-4',
              twitchToken ? '' : 'tooltip tooltip-top'
            )}
            data-tip="You must link your Twitch account first"
          >
            <button
              className={clsx(
                'btn grow',
                twitchToken ? 'btn-primary' : 'btn-disabled'
              )}
              onClick={copyOverlayLink}
            >
              Copy overlay link
            </button>
            <button
              className={clsx(
                'btn grow',
                twitchToken ? 'btn-primary' : 'btn-disabled'
              )}
              onClick={copyDockLink}
            >
              Copy dock link
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
