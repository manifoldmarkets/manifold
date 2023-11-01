import { buildArray } from 'common/util/array'
import { Lover } from 'love/hooks/use-lover'
import { Carousel } from 'web/components/widgets/carousel'
import Image from 'next/image'
import { Modal } from 'web/components/layout/modal'
import { useState } from 'react'
import { User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { SignUpButton } from './nav/love-sidebar'

export default function ProfileCarousel(props: {
  lover: Lover
  currentUser: User | null
}) {
  const { lover, currentUser } = props
  const photoNums = lover.photo_urls ? lover.photo_urls.length : 0

  const [lightboxUrl, setLightboxUrl] = useState('')
  if (!currentUser) {
    return (
      <Carousel>
        {lover.pinned_url && (
          <div className="relative h-80 min-w-[250px] flex-none snap-start gap-1 overflow-hidden rounded">
            <Image
              src={lover.pinned_url}
              fill
              alt={`preview pinned photo`}
              className="w-full object-cover"
            />
          </div>
        )}
        {photoNums > 0 && (
          <Col className="bg-canvas-100 dark:bg-canvas-0 text-ink-500 relative h-80 w-[250px] flex-none items-center rounded text-6xl ">
            <Col className=" m-auto items-center gap-1">
              <div className="select-none font-semibold">+{photoNums}</div>
              <SignUpButton
                text="Sign up to see"
                size="xs"
                color="none"
                className="dark:text-ink-500 hover:text-primary-500 hover:underline"
              />
            </Col>
          </Col>
        )}
      </Carousel>
    )
  }
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
