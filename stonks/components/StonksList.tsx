import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { StonkPrice } from './StonkValue'
import { StonkContract } from 'common/contract'
import { Row } from './layout/row'
import { StonkImage } from 'common/stonk-images'
import { Col } from './layout/col'

export function StonksList() {
  const [stonks, setStonks] = useState<StonkContract[]>([])
  const [images, setImages] = useState<StonkImage[]>([])
  const [error, setError] = useState<string>()

  console.log(images)

  useEffect(() => {
    const fetchStonks = async () => {
      try {
        const data = await api('search-markets', {
          contractType: 'STONK',
          sort: 'prob-descending',
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
  }, [])

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
      {stonks.map((stonk, index) => {
        const image = images.find((i) => i.contractId === stonk.id)

        return (
          <Row key={stonk.id} className="w-full items-center p-2">
            <div className="mr-4 w-8 text-2xl text-gray-400">{index + 1}</div>
            {image?.imageUrl && (
              <img
                src={image.imageUrl}
                alt={cleanQuestion(stonk.question)}
                className="mr-2 h-24 w-24 shrink-0 rounded-full object-cover"
              />
            )}
            <Col>
              <div className="mr-4 flex-1">{cleanQuestion(stonk.question)}</div>
              <StonkPrice contract={stonk} />
            </Col>
          </Row>
        )
      })}
    </div>
  )
}
