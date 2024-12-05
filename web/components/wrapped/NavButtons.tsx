import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'

export function NavButtons(props: {
  goToPrevPage?: () => void
  goToNextPage?: () => void
}) {
  const { goToPrevPage, goToNextPage } = props
  return (
    <>
      {goToPrevPage && (
        <button
          onClick={goToPrevPage}
          className="absolute bottom-0 left-0 top-0 z-50 w-[calc(50%-60px)] opacity-0 transition-opacity sm:hover:opacity-100"
        >
          <ChevronLeftIcon className="animate-bounce-left-loop h-12 w-12" />
        </button>
      )}
      {goToNextPage && (
        <button
          onClick={goToNextPage}
          className="absolute bottom-0 right-0 top-0 z-50 flex w-[calc(50%-60px)] flex-row justify-end opacity-0 transition-opacity sm:hover:opacity-100
        "
        >
          <ChevronRightIcon className="animate-bounce-right-loop my-auto h-12 w-12" />
        </button>
      )}
    </>
  )
}
