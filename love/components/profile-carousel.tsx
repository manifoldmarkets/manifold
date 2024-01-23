import { useState } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import Router from 'next/router'

import { buildArray } from 'common/util/array'
import { Carousel } from 'web/components/widgets/carousel'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { SignUpButton } from './nav/love-sidebar'
import { Lover } from 'common/love/lover'
import { useAdmin } from 'web/hooks/use-admin'
import { Button } from 'web/components/buttons/button'
import { updateLover } from 'web/lib/firebase/love/api'
import { AddPhotosWidget } from './widgets/add-photos'
import { Row as rowFor } from 'common/supabase/utils'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { PencilIcon } from '@heroicons/react/solid'
import { api } from 'web/lib/firebase/api'

export default function ProfileCarousel(props: { lover: Lover }) {
  const { lover } = props
  const photoNums = lover.photo_urls ? lover.photo_urls.length : 0

  const [lightboxUrl, setLightboxUrl] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const isAdmin = useAdmin()
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === lover.user_id

  if (!currentUser) {
    return (
      <Carousel>
        {lover.pinned_url && (
          <div className="h-80 w-[250px] flex-none snap-start">
            <Image
              priority={true}
              src={lover.pinned_url}
              height={360}
              width={240}
              sizes="(max-width: 640px) 100vw, 240px"
              alt=""
              className="h-full cursor-pointer rounded object-cover"
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
      {isAdmin && (
        <Button
          className="self-end"
          size="2xs"
          color="red"
          onClick={() => {
            console.log('deleting')
            api('remove-pinned-photo', { userId: lover.user_id }).then(() =>
              Router.back()
            )
          }}
        >
          Admin: Delete pinned photo
        </Button>
      )}
      <Carousel className="group relative">
        {buildArray(lover.pinned_url, lover.photo_urls).map((url, i) => {
          return (
            <div key={url} className="h-80 w-[250px] flex-none snap-start">
              <Image
                priority={i < 3}
                src={url}
                height={360}
                width={240}
                sizes="(max-width: 640px) 100vw, 240px"
                alt=""
                className="h-full cursor-pointer rounded object-cover"
                onClick={() => {
                  setLightboxUrl(url)
                  setDialogOpen(true)
                }}
              />
            </div>
          )
        })}

        {isCurrentUser && (
          <div
            className={clsx(
              'absolute top-2 z-[10] transition-opacity sm:opacity-0 sm:group-hover:opacity-100',
              !lover.photo_urls || lover.photo_urls.length < 1
                ? 'left-[200px]'
                : 'right-2'
            )}
          >
            <EditPhotosButton user={currentUser} lover={lover} />
          </div>
        )}
      </Carousel>
      <Modal open={dialogOpen} setOpen={setDialogOpen}>
        <Image src={lightboxUrl} width={1000} height={1000} alt="" />
      </Modal>
    </>
  )
}

const EditPhotosButton = (props: { user: User; lover: Lover }) => {
  const { user } = props
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [lover, setLover] = useState<Lover>(props.lover)

  const setLoverState = (key: keyof rowFor<'lovers'>, value: any) => {
    setLover((prevState) => ({ ...prevState, [key]: value }))
  }

  const submit = async () => {
    setIsSubmitting(true)
    await updateLover(lover)
    setIsSubmitting(false)
    setDialogOpen(false)
    window.location.reload()
  }

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className="bg-ink-500 hover:bg-ink-300 rounded p-1 transition-colors"
      >
        <PencilIcon className=" h-5 w-5 text-white" />
      </button>
      <Modal open={dialogOpen} setOpen={setDialogOpen}>
        <Col className={clsx(MODAL_CLASS)}>
          <AddPhotosWidget
            user={user}
            photo_urls={lover.photo_urls}
            pinned_url={lover.pinned_url}
            setPhotoUrls={(urls) => setLoverState('photo_urls', urls)}
            setPinnedUrl={(url) => setLoverState('pinned_url', url)}
          />
          <Row className="gap-4 self-end">
            <Button color="gray-outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="self-end"
              onClick={submit}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Save
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
