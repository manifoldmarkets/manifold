import { contractPath, StonkContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

import { StonkImage } from 'common/stonk-images'
import Link from 'next/link'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { StonkBetButton } from './bet/stonk-bet-button'
import { StonkImageUploader } from './StonkImageUploader'
import { StonkPrice } from './StonkValue'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import { ChevronDownIcon } from '@heroicons/react/solid'
import DropdownMenu from '../widgets/dropdown-menu'

export type StonkSort = 'prob-descending' | 'prob-ascending' | 'most-popular'

export function StonksList() {
  const [stonks, setStonks] = useState<StonkContract[]>([])
  const [images, setImages] = useState<StonkImage[]>([])
  const [error, setError] = useState<string>()
  const user = useUser()

  const [sort, setSort] = useState<StonkSort>('prob-descending')
  const [topic, setTopic] = useState<string>()

  const STONK_SORTS = [
    { label: 'Highest', value: 'prob-descending' },
    { label: 'Lowest', value: 'prob-ascending' },
    { label: 'Popular', value: 'most-popular' },
  ] as const

  const STONK_TOPICS = [
    { label: 'Destiny', value: 'destinygg' },
    { label: 'One Piece', value: 'one-piece-stocks' },
    { label: 'JasonTheWeen', value: 'jasontheween' },
  ] as const

  useEffect(() => {
    const fetchStonks = async () => {
      try {
        const data = await api('search-markets', {
          contractType: 'STONK',
          sort: sort,
          limit: 100,
        })
        const stonkImages = await api('get-stonk-images', {
          contracts: data.map((c) => c.id),
        })
        setImages(stonkImages.images)
        setStonks(data as any as StonkContract[])
      } catch (e) {
        setError('Failed to load stonks')
        console.error(e)
      }
    }
    fetchStonks()
  }, [sort])

  if (error) return <div>Error: {error}</div>

  const cleanQuestion = (question: string) => {
    return (
      question
        // Remove "Stock", "stock", with optional special characters around them
        .replace(/[^\w\s]?stock[^\w\s]?/gi, '')
        // Remove "(Permanent)" or "[Permanent]" with optional special characters
        .replace(/[^\w\s]?\(permanent\)[^\w\s]?/gi, '')
        .replace(/[^\w\s]?\[permanent\][^\w\s]?/gi, '')
        .trim()
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Row className="mb-2 w-full justify-end">
        <DropdownMenu
          closeOnClick
          items={generateFilterDropdownItems(STONK_SORTS, setSort)}
          buttonContent={
            <Row className="text-ink-500 items-center gap-0.5">
              <span className="whitespace-nowrap text-sm font-medium">
                {STONK_SORTS.find((s) => s.value === sort)?.label}
              </span>
              <ChevronDownIcon className="h-4 w-4" />
            </Row>
          }
          buttonClass={
            'h-8 rounded-full bg-ink-100 hover:bg-ink-200 text-ink-600 dark:bg-ink-300 dark:hover:bg-ink-400 py-1 text-sm px-3'
          }
        />
      </Row>
      {stonks.map((stonk, index) => {
        const image = images.find((i) => i.contractId === stonk.id)

        return (
          <Row
            key={stonk.id}
            className="hover:bg-ink-100 w-full flex-wrap items-center rounded-lg p-4 transition-colors"
          >
            <div className="text-ink-500 mr-4 w-6 text-lg font-semibold sm:w-8 sm:text-xl">
              {index + 1}
            </div>
            {image?.imageUrl ? (
              <img
                src={image.imageUrl}
                alt={cleanQuestion(stonk.question)}
                className="mr-4 h-16 w-16 shrink-0 rounded-lg object-cover shadow-sm sm:h-20 sm:w-20"
              />
            ) : (
              <StonkImageUploader
                stonkId={stonk.id}
                onImageUploaded={(imageUrl) => {
                  setImages([...images, { contractId: stonk.id, imageUrl }])
                }}
              />
            )}
            <Col className="min-w-0 flex-1 gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <Link
                  href={contractPath(stonk)}
                  className="break-words font-semibold hover:text-indigo-500 hover:underline"
                >
                  {cleanQuestion(stonk.question)}
                </Link>
                <div className="text-ink-500 whitespace-nowrap text-xs sm:text-sm">
                  {stonk.uniqueBettorCount ?? 0} traders
                </div>
              </div>

              <Row className="flex-wrap items-center justify-between gap-2">
                <StonkPrice contract={stonk} />
                <StonkBetButton contract={stonk} user={user} />
              </Row>
            </Col>
          </Row>
        )
      })}
    </div>
  )
}
