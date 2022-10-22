import clsx from 'clsx'
import { Spacer } from '../layout/spacer'
import { Row } from '../layout/row'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import { ReactNode } from 'react'
import { range } from 'lodash'
export const PAGE_ELLIPSES = '...'

export function PaginationNextPrev(props: {
  className?: string
  prev?: ReactNode
  next?: ReactNode
  onClickPrev: () => void
  onClickNext: () => void
  scrollToTop?: boolean
}) {
  const { className, prev, next, onClickPrev, onClickNext, scrollToTop } = props
  return (
    <Row className={clsx(className, 'flex-1 justify-between sm:justify-end')}>
      {prev != null && (
        <a
          href={scrollToTop ? '#' : undefined}
          className="relative inline-flex cursor-pointer select-none items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={onClickPrev}
        >
          {prev ?? 'Previous'}
        </a>
      )}
      {next != null && (
        <a
          href={scrollToTop ? '#' : undefined}
          className="relative ml-3 inline-flex cursor-pointer select-none items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={onClickNext}
        >
          {next ?? 'Next'}
        </a>
      )}
    </Row>
  )
}

export function Pagination(props: {
  page: number
  itemsPerPage: number
  totalItems: number
  setPage: (page: number) => void
  scrollToTop?: boolean
  className?: string
}) {
  const { page, itemsPerPage, totalItems, setPage, scrollToTop, className } =
    props

  const maxPage = Math.ceil(totalItems / itemsPerPage) - 1

  if (maxPage <= 0) return <Spacer h={4} />

  const pageNumbers = getPageNumbers(maxPage, page)
  return (
    <nav
      className={clsx('flex w-full items-center bg-white pt-2 pb-4', className)}
      aria-label="Pagination"
    >
      <Row className="mx-auto gap-4">
        <PaginationArrow
          scrollToTop={scrollToTop}
          onClick={() => setPage(page - 1)}
          disabled={page <= 0}
          nextOrPrev="prev"
        />
        <Row className="gap-2">
          {pageNumbers.map((pageNumber) => (
            <PageNumbers
              key={pageNumber}
              pageNumber={pageNumber}
              setPage={setPage}
              page={page}
            />
          ))}
        </Row>
        <PaginationArrow
          scrollToTop={scrollToTop}
          onClick={() => setPage(page + 1)}
          disabled={page >= maxPage}
          nextOrPrev="next"
        />
      </Row>
    </nav>
  )
}

export function PaginationArrow(props: {
  scrollToTop?: boolean
  onClick: () => void
  disabled: boolean
  nextOrPrev: 'next' | 'prev'
}) {
  const { scrollToTop, onClick, disabled, nextOrPrev } = props
  return (
    <a
      href={scrollToTop ? '#' : undefined}
      onClick={onClick}
      className={clsx(
        'select-none rounded-lg transition-colors',
        disabled
          ? 'text-greyscale-2 pointer-events-none'
          : 'hover:bg-greyscale-1.5 cursor-pointer text-indigo-700'
      )}
    >
      {nextOrPrev === 'prev' && (
        <ChevronLeftIcon className="h-[24px] w-[24px]" />
      )}
      {nextOrPrev === 'next' && (
        <ChevronRightIcon className="h-[24px] w-[24px]" />
      )}
    </a>
  )
}

export function PageNumbers(props: {
  pageNumber: pageNumbers
  setPage: (page: number) => void
  page: number
}) {
  const { pageNumber, setPage, page } = props
  if (pageNumber === PAGE_ELLIPSES || typeof pageNumber === 'string') {
    return <div className="text-greyscale-4 select-none">{PAGE_ELLIPSES}</div>
  }
  return (
    <button
      onClick={() => setPage(pageNumber)}
      className={clsx(
        'select-none rounded-lg px-2',
        page === pageNumber
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-greyscale-4 hover:bg-greyscale-1.5'
      )}
    >
      {pageNumber + 1}
    </button>
  )
}

type pageNumbers = number | string

export function getPageNumbers(
  maxPage: number,
  page: number
): Array<pageNumbers> {
  if (maxPage <= 7) {
    return range(0, maxPage + 1)
  }
  if (page < 4) {
    return Array.from<unknown, pageNumbers>(
      { length: 5 },
      (_, index) => index
    ).concat([PAGE_ELLIPSES, maxPage])
  }
  if (page >= maxPage - 3) {
    return [0, PAGE_ELLIPSES].concat(
      Array.from<unknown, pageNumbers>(
        { length: 5 },
        (_, index) => index + maxPage - 4
      )
    )
  }
  return [0, PAGE_ELLIPSES, page - 1, page, page + 1, PAGE_ELLIPSES, maxPage]
}
