import { LinkIcon } from '@heroicons/react/solid'
import { Row } from '../layout/row'
import clsx from 'clsx'
import { PiXLogo } from 'react-icons/pi'

export function UserHandles(props: {
  website?: string | null
  twitterHandle?: string | null
  discordHandle?: string | null
  className?: string
}) {
  const { website, twitterHandle, discordHandle, className } = props
  return (
    <Row
      className={clsx(
        'text-ink-400 flex-wrap items-center gap-2 sm:gap-4',
        className
      )}
    >
      {website && (
        <a
          target={'_blank'}
          href={
            'https://' + website.replace('http://', '').replace('https://', '')
          }
        >
          <Row className="items-center gap-1">
            <LinkIcon className="h-4 w-4" />
            <span className="text-ink-400 text-sm">{website}</span>
          </Row>
        </a>
      )}

      {twitterHandle && (
        <a
          target={'_blank'}
          href={`https://twitter.com/${twitterHandle
            .replace('https://www.twitter.com/', '')
            .replace('https://twitter.com/', '')
            .replace('www.twitter.com/', '')
            .replace('twitter.com/', '')
            .replace(/^@/, '')}`}
        >
          <Row className="items-center gap-1">
            <PiXLogo className="h-4 w-4" aria-label="X" />
            <span className="text-ink-400 text-sm">{twitterHandle}</span>
          </Row>
        </a>
      )}

      {discordHandle && (
        <a target={'_blank'} href="https://discord.com/invite/eHQBNBqXuh">
          <Row className="items-center gap-1">
            <img src="/discord-logo.svg" className="h-4 w-4" alt="Discord" />
            <span className="text-ink-400 text-sm">{discordHandle}</span>
          </Row>
        </a>
      )}
    </Row>
  )
}
