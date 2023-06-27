import clsx from 'clsx'
import { Spacer } from '../layout/spacer'
import { Row } from '../layout/row'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import { ReactNode, useEffect } from 'react'
import { range } from 'lodash'
import { useRouter } from 'next/router'
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
          className="border-ink-300 text-ink-700 hover:bg-canvas-50 bg-canvas-0 relative inline-flex cursor-pointer select-none items-center rounded-md border px-4 py-2 text-sm font-medium"
          onClick={onClickPrev}
        >
          {prev ?? 'Previous'}
        </a>
      )}
      {next != null && (
        <a
          href={scrollToTop ? '#' : undefined}
          className="border-ink-300 text-ink-700 hover:bg-canvas-50 bg-canvas-0 relative ml-3 inline-flex cursor-pointer select-none items-center rounded-md border px-4 py-2 text-sm font-medium"
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
  className?: string
  savePageToQuery?: boolean
}) {
  const {
    page,
    itemsPerPage,
    totalItems,
    setPage,
    className,
    savePageToQuery,
  } = props
  const router = useRouter()
  const { query } = router
  const { p: pageQuery } = query

  useEffect(() => {
    if (savePageToQuery) {
      if (pageQuery && page !== parseInt(pageQuery as string)) {
        setPage(parseInt(pageQuery as string))
      } else if (!pageQuery && page !== 0) {
        setPage(0)
      }
    }
  }, [pageQuery])

  const onClick = (page: number) => {
    if (savePageToQuery) {
      router.push(
        {
          query: {
            ...router.query,
            p: page.toString(),
          },
        },
        {
          query: {
            ...router.query,
            p: (page + 1).toString(),
          },
        }
      )
    }
    setPage(page)
  }

  const maxPage = Math.ceil(totalItems / itemsPerPage) - 1

  if (maxPage <= 0) return <Spacer h={4} />

  const pageNumbers = getPageNumbers(maxPage, page)
  return (
    <nav
      className={clsx(
        'flex w-full items-center bg-inherit pt-2 pb-4',
        className
      )}
      aria-label="Pagination"
    >
      <Row className="mx-auto gap-4">
        <PaginationArrow
          onClick={() => onClick(page - 1)}
          disabled={page <= 0}
          nextOrPrev="prev"
        />
        <Row className="gap-2">
          {pageNumbers.map((pageNumber) => (
            <PageNumbers
              key={pageNumber}
              pageNumber={pageNumber}
              setPage={onClick}
              page={page}
            />
          ))}
        </Row>
        <PaginationArrow
          onClick={() => onClick(page + 1)}
          disabled={page >= maxPage}
          nextOrPrev="next"
        />
      </Row>
    </nav>
  )
}

export function PaginationArrow(props: {
  onClick: () => void
  disabled: boolean
  nextOrPrev: 'next' | 'prev'
}) {
  const { onClick, disabled, nextOrPrev } = props
  return (
    <div
      onClick={onClick}
      className={clsx(
        'select-none rounded-lg transition-colors',
        disabled
          ? 'text-ink-200 pointer-events-none'
          : 'hover:bg-ink-100 text-primary-700 cursor-pointer'
      )}
    >
      {nextOrPrev === 'prev' && (
        <ChevronLeftIcon className="h-[24px] w-[24px]" />
      )}
      {nextOrPrev === 'next' && (
        <ChevronRightIcon className="h-[24px] w-[24px]" />
      )}
    </div>
  )
}

export function PageNumbers(props: {
  pageNumber: pageNumbers
  setPage: (page: number) => void
  page: number
}) {
  const { pageNumber, setPage, page } = props
  if (pageNumber === PAGE_ELLIPSES || typeof pageNumber === 'string') {
    return <div className="text-ink-400 select-none">{PAGE_ELLIPSES}</div>
  }
  return (
    <button
      onClick={() => setPage(pageNumber)}
      className={clsx(
        'select-none rounded-lg px-2',
        page === pageNumber
          ? 'bg-primary-100 text-primary-700'
          : 'text-ink-400 hover:bg-ink-100'
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
