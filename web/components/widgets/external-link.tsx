import { ExternalLinkIcon } from '@heroicons/react/outline'
import Link from 'next/link'
import { Row } from '../layout/row'

export const ExternalLink = (props: {
  title: string
  href: string
  onClick?: () => void
}) => {
  const { title, href, onClick } = props

  return (
    <Link href={href} onClick={onClick} target="_blank" className="mb-4 block">
      <div className="  items-center hover:text-indigo-400 hover:underline ">
        {title}
        <ExternalLinkIcon className="ml-1 inline-block h-4 w-4 " />
      </div>
    </Link>
  )
}
