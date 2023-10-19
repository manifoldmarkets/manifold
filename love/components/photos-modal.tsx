import { useEffect, useState } from 'react'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import Image from 'next/image'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'

export const PhotosModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  photos: string[]
}) => {
  const { open, setOpen, photos } = props
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!open) setTimeout(() => setIndex(0), 100)
  }, [open])
  return (
    <Modal open={open} size={'xl'} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <Image
          src={photos[index]}
          width={500}
          height={700}
          alt={`preview ${index}`}
          className="h-full w-full rounded-sm object-cover"
        />
        <Row className={'gap-2'}>
          <Button onClick={() => setIndex(index - 1)} disabled={index === 0}>
            Previous
          </Button>
          <Button
            onClick={() => setIndex(index + 1)}
            disabled={index === photos.length - 1}
          >
            Next
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
