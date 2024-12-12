import { StonkContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { StonkImageUploader } from 'stonks/components/admin/StonkImageUploader'
import { api } from 'web/lib/api/api'

export default function Uploader() {
  const [stonks, setStonks] = useState<StonkContract[]>([])
  const [images, setImages] = useState<any>()
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
  return (
    <div>
      {stonks.map((stonk) => (
        <StonkImageUploader stonkId={stonk.id} question={stonk.question} />
      ))}
    </div>
  )
}
