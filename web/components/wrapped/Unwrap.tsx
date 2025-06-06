import clsx from 'clsx'
import { Col } from '../layout/col'
import { useEffect, useState } from 'react'
import { NavButtons } from './NavButtons'

export function Unwrap(props: { goToNextPage: () => void }) {
  const { goToNextPage } = props
  const [animate, setAnimate] = useState(false)
  const [buttonClicked, setButtonClicked] = useState(false)

  const handleButtonClick = () => {
    if (!buttonClicked) {
      setButtonClicked(true)
      setAnimate(true)

      // Optionally reset the animation
      setTimeout(() => {
        goToNextPage()
      }, 1000) // Reset after 1s
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!buttonClicked) {
        handleButtonClick()
      }
    }, 1500)

    // Cleanup function
    return () => {
      clearTimeout(timeout)
      setButtonClicked(false) // Reset buttonClicked on unmount
    }
  })
  return (
    <>
      <Col
        className={clsx(
          'z-40 mx-auto my-auto flex items-center gap-1',
          animate && 'animate-fade-out'
        )}
      >
        <div className="font-mono text-xl">MANIFOLD WRAPPED</div>
        <div className="text-8xl font-semibold">2024</div>
      </Col>
      <div
        className={clsx(
          'absolute left-[calc(50%-80px)] h-full w-40 bg-red-700',
          animate && 'animate-slide-up-out'
        )}
      />
      <div
        className={clsx(
          'absolute top-[calc(50%-85px)] h-40 w-full bg-red-600',
          animate && 'animate-slide-left-out'
        )}
      />
      <NavButtons goToNextPage={handleButtonClick} />
    </>
  )
}
