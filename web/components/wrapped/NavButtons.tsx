import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row } from '../layout/row'

export function NavButtons(props: {
  goToPrevPage: () => void
  goToNextPage: () => void
  hidePrev?: boolean
  hideNext?: boolean
}) {
  const { goToPrevPage, goToNextPage, hidePrev, hideNext } = props

  return (
    <Row className="absolute bottom-8 left-0 right-0 justify-center gap-6">
      <button
        onClick={goToPrevPage}
        className={clsx(
          'rounded-full p-4 text-white transition-all duration-300',
          'bg-gradient-to-br from-red-500/30 to-green-500/30 backdrop-blur-sm',
          'border border-white/20 hover:border-white/40',
          'hover:scale-110 hover:shadow-lg hover:shadow-red-500/20',
          'active:scale-95',
          hidePrev && 'invisible'
        )}
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>
      <button
        onClick={goToNextPage}
        className={clsx(
          'rounded-full p-4 text-white transition-all duration-300',
          'bg-gradient-to-br from-green-500/30 to-red-500/30 backdrop-blur-sm',
          'border border-white/20 hover:border-white/40',
          'hover:scale-110 hover:shadow-lg hover:shadow-green-500/20',
          'active:scale-95',
          hideNext && 'invisible'
        )}
      >
        <ChevronRightIcon className="h-6 w-6" />
      </button>
    </Row>
  )
}
