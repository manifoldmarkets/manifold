import { CheckCircleIcon } from '@heroicons/react/outline'
import { XIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import { uniq } from 'lodash'
import { useState } from 'react'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { Button, buttonClass } from 'web/components/buttons/button'
import { uploadImage } from 'web/lib/firebase/storage'
import { buildArray } from 'common/util/array'
import { Row } from 'web/components/layout/row'
import { User } from 'common/user'
import { PlusIcon } from '@heroicons/react/solid'

export const AddPhotosWidget = (props: {
  user: User
  photo_urls: string[] | null
  pinned_url: string | null
  setPhotoUrls: (urls: string[]) => void
  setPinnedUrl: (url: string) => void
}) => {
  const { user, photo_urls, pinned_url, setPhotoUrls, setPinnedUrl } = props

  const [uploadingImages, setUploadingImages] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploadingImages(true)

    // Convert files to an array and take only the first 6 files
    const selectedFiles = Array.from(files).slice(0, 6)

    const urls = await Promise.all(
      selectedFiles.map((f) => uploadImage(user.username, f, 'love-images'))
    ).catch((e) => {
      console.error(e)
      return []
    })
    if (!pinned_url) setPinnedUrl(urls[0])
    setPhotoUrls(uniq([...(photo_urls ?? []), ...urls]))
    setUploadingImages(false)
  }

  return (
    <Col className="gap-2">
      <input
        id="photo-upload"
        type="file"
        onChange={handleFileChange}
        multiple // Allows multiple files to be selected
        className={'hidden'}
        disabled={uploadingImages}
      />
      {/* <label
        className={clsx(
          buttonClass('md', 'indigo'),
          'cursor-pointer self-start'
        )}
        htmlFor="photo-upload"
      >
        Add photos
      </label> */}
      <Row className="flex-wrap gap-2">
        {uniq(buildArray(pinned_url, photo_urls))?.map((url, index) => {
          const isPinned = url === pinned_url
          return (
            <div
              key={index}
              className={clsx(
                'relative cursor-pointer rounded-md border-2 p-2',
                isPinned ? 'border-teal-500' : 'border-canvas-100',
                'hover:border-teal-900'
              )}
              onClick={() => {
                if (isPinned) return
                setPhotoUrls(uniq(buildArray(pinned_url, photo_urls)))
                setPinnedUrl(url)
              }}
            >
              {isPinned && (
                <div className={clsx(' absolute left-0 top-0 rounded-full')}>
                  <CheckCircleIcon
                    className={
                      ' bg-canvas-0 h-6 w-6 rounded-full text-teal-500'
                    }
                  />
                </div>
              )}
              <Button
                onClick={(e) => {
                  e.stopPropagation()
                  const newUrls = (photo_urls ?? []).filter((u) => u !== url)
                  if (isPinned) setPinnedUrl(newUrls[0] ?? '')
                  setPhotoUrls(newUrls)
                }}
                color={'gray-outline'}
                size={'2xs'}
                className={clsx(
                  'bg-canvas-0 absolute right-0 top-0 !rounded-full !px-1 py-1'
                )}
              >
                <XIcon className={'h-4 w-4'} />
              </Button>
              <Image
                src={url}
                width={80}
                height={80}
                alt={`preview ${index}`}
                className="h-20 w-20 object-cover"
              />
            </div>
          )
        })}
        <label
          className={clsx(
            'bg-ink-200 hover:bg-ink-300 text-ink-0 dark:text-ink-500 hover:dark:text-ink-600 flex h-[100px] w-[100px]  cursor-pointer flex-col items-center rounded-md transition-colors'
          )}
          htmlFor="photo-upload"
        >
          <PlusIcon className=" mx-auto my-auto h-16 w-16" />
        </label>
      </Row>
      {photo_urls?.length ? (
        <span className={'text-ink-500 text-xs italic'}>
          The highlighted image is your profile picture
        </span>
      ) : null}
    </Col>
  )
}
