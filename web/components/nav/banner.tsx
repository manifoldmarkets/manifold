import { ExternalLinkIcon, XIcon } from '@heroicons/react/outline'
import { IconButton } from '../buttons/button'
import { Row } from '../layout/row'
import clsx from 'clsx'

export function Banner(props: {
  setShowBanner: (show: boolean) => void
  className?: string
  children: React.ReactNode
  link: string
}) {
  const { setShowBanner, className, children, link } = props
  return (
    <Row
      className={clsx(
        className,
        'bg-primary-100 text-ink-900 group items-center justify-between gap-4'
      )}
    >
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-3 pl-4"
      >
        {children}
      </a>
      <IconButton onClick={() => setShowBanner(false)}>
        <XIcon className="h-5 w-5 cursor-pointer" />
      </IconButton>
    </Row>
  )
}
