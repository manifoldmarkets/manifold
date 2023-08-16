import { ExternalLinkIcon } from '@heroicons/react/outline'
import Link from 'next/link'

export const ExternalLink = (props: {
  title: string
  href: string
  onClick?: () => void
  className?: string
}) => {
  const { title, href, onClick, className } = props

  return (
    <Link href={href} onClick={onClick} target="_blank" className={className}>
      <span className="items-center hover:text-indigo-400 hover:underline ">
        {title}
        <ExternalLinkIcon className="ml-1 inline-block h-4 w-4 " />
      </span>
    </Link>
  )
}
