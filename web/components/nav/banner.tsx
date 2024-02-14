import { XIcon } from '@heroicons/react/outline'
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
        'text-ink-900 group items-center justify-between gap-4 bg-pink-100'
      )}
    >
      <a href={link} className="w-full py-3 pl-4">
        {children}
      </a>
      <IconButton onClick={() => setShowBanner(false)}>
        <XIcon className="h-5 w-5 cursor-pointer" />
      </IconButton>
    </Row>
  )
}
