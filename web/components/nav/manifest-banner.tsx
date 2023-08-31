import Image from 'next/image'
import { ExternalLinkIcon, XIcon } from '@heroicons/react/outline'
import { Button } from '../buttons/button'
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
        'border-1 dark-indigo-700 items-center justify-between gap-4 border-indigo-200 bg-indigo-100 px-4 py-1.5 pr-2 dark:bg-indigo-800'
      )}
    >
      <Row className="mx-auto gap-2">
        <a
          href="https://www.manifestconference.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Get tickets to{' '}
          <Image
            className="inline place-self-center object-contain align-middle"
            src="/images/Manifest_Logo.png"
            alt="Manifold Logo"
            height={24}
            width={24}
          />{' '}
          <span className="font-semibold">Manifest</span> — our first
          forecasting festival, Sept 22-24 in Berkeley, CA
          <ExternalLinkIcon className="ml-1 inline-block h-4 w-4 " />
        </a>
      </Row>
      <Button
        className="shadow-none"
        color="none"
        onClick={() => setShowBanner(false)}
      >
        <XIcon className="h-5 w-5 cursor-pointer" />
      </Button>
    </Row>
  )
}
