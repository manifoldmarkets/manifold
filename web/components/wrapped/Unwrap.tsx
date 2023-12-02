import clsx from 'clsx'
import { Col } from '../layout/col'
import { useState } from 'react'

export function Unwrap(props: { goToNextPage: () => void }) {
  const { goToNextPage } = props
  const [animate, setAnimate] = useState(false)

  const handleButtonClick = () => {
    setAnimate(true)

    // Optionally reset the animation
    setTimeout(() => {
      setAnimate(false)
      goToNextPage()
    }, 1000) // Reset after 1s
  }

  return (
    <>
      <Col
        className={clsx(
          'z-40 mx-auto my-auto flex items-center gap-1',
          animate && 'animate-fade-out'
        )}
      >
        <div className="font-mono text-xl">MANIFOLD WRAPPED</div>
        <div className="text-8xl font-semibold">2023</div>
        <button
          onClick={handleButtonClick}
          className="text-semibold mt-4 h-24 w-24 rounded-full bg-gradient-to-tr from-yellow-700 to-yellow-500 text-center font-mono"
        >
          UNWRAP 2023
        </button>
      </Col>
      <div
        className={clsx(
          'absolute left-[calc(50%-80px)] h-full w-40 bg-red-700',
          animate && 'animate-slide-up-out'
        )}
      />
      <div
        className={clsx(
          'absolute top-[calc(50%-145px)] h-40 w-full bg-red-600',
          animate && 'animate-slide-left-out'
        )}
      />
    </>
  )
}
