import { buildArray } from 'common/util/array'
import { Lover } from 'love/hooks/use-lover'
import { Carousel } from 'web/components/widgets/carousel'
import Image from 'next/image'
import { Modal } from 'web/components/layout/modal'
import { useState } from 'react'

export default function ProfileCarousel(props: { lover: Lover }) {
  const { lover } = props

  const [lightboxUrl, setLightboxUrl] = useState('')
  return (
    <>
      <Carousel>
        {buildArray(lover.pinned_url, lover.photo_urls).map((url, index) => {
          return (
            <div
              key={url}
              className="relative h-80 min-w-[250px] flex-none snap-start gap-1 overflow-hidden rounded"
            >
              <Image
                src={url}
                fill
                alt={`preview ${index}`}
                className="w-full object-cover"
                onClick={() => {
                  setLightboxUrl(url)
                }}
              />
            </div>
          )
        })}
      </Carousel>
      <Modal open={!!lightboxUrl} setOpen={() => setLightboxUrl('')}>
        <Image src={lightboxUrl} width={1000} height={1000} alt="" />
      </Modal>
    </>
  )
}
