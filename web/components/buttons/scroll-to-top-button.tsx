import { ArrowUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Row } from '../layout/row'

export function ScrollToTopButton(props: { className?: string }) {
  const { className } = props
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 500) {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <button
      className={clsx(
        'rounded-full border border-gray-200 bg-gray-50 py-2 pr-3 pl-2 text-sm transition-colors hover:bg-gray-200',
        visible ? 'inline' : 'hidden',
        className
      )}
      onClick={scrollToTop}
    >
      <Row className="gap-2 align-middle text-gray-600">
        <ArrowUpIcon className="h-5 w-5 text-gray-400" />
        Scroll to top
      </Row>
    </button>
  )
}
