import { ArrowCircleUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Button } from './button'

export function ScrollToTopButton(props: { className?: string }) {
  const { className } = props
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
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
        'border-5 h-14 w-14 border border-yellow-400 bg-green-400',
        visible ? 'inline' : 'hidden',
        className
      )}
    >
      <ArrowCircleUpIcon onClick={scrollToTop} />
    </button>
  )
}
