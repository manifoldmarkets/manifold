import { ExternalLinkIcon, XIcon } from '@heroicons/react/outline'
import { IconButton } from '../buttons/button'
import { Row } from '../layout/row'
import clsx from 'clsx'

export function ManifestBanner(props: {
  setShowBanner: (show: boolean) => void
  className?: string
}) {
  const { setShowBanner, className } = props
  return (
    <Row
      className={clsx(
        className,
        'bg-primary-100 text-ink-900 group items-center justify-between gap-4'
      )}
    >
      <a
        href="https://www.manifestconference.net/"
        target="_blank"
        rel="noopener noreferrer"
        className="py-3 pl-4"
      >
        Get tickets to{' '}
        <span className="inline-block font-semibold group-hover:animate-bounce">
          Manifest
        </span>{' '}
        — our first forecasting festival, Sept 22-24 in Berkeley, CA
        <ExternalLinkIcon className="ml-1 inline-block h-4 w-4" />
      </a>
      <IconButton onClick={() => setShowBanner(false)}>
        <XIcon className="h-5 w-5 cursor-pointer" />
      </IconButton>
    </Row>
  )
}
