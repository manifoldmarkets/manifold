import { ArrowUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Row } from './layout/row'

export function ScrollToTopButton(props: { className?: string }) {
  const { className } = props
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 500) {
        console.log('button commence')
        setVisible(true)
      } else {
        setVisible(false)
      }
    })
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
        'border-greyscale-2 bg-greyscale-1 rounded-full border py-2 px-4 text-sm',
        visible ? 'inline' : 'hidden',
        className
      )}
      onClick={scrollToTop}
    >
      <Row className="text-greyscale-6 gap-1 align-middle">
        <ArrowUpIcon className="text-greyscale-4 h-5 w-5" />
        Scroll to top
      </Row>
    </button>
  )
}
