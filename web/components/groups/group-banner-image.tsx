import { PencilIcon, PhotographIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { User } from 'common/user'
import Image from 'next/image'
import { useState } from 'react'
import { updateGroup } from 'web/lib/firebase/api'
import { uploadImage } from 'web/lib/firebase/storage'
import { Button } from '../buttons/button'
import DropdownMenu from '../comments/dropdown-menu'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'

export const DEFAULT_BANNERS = [
  '/group/default_group_banner_indigo.png',
  '/group/default_group_banner_green.png',
  '/group/default_group_banner_red.png',
]

export default function BannerImage(props: {
  group: Group
  user: User | undefined | null
  canEdit: boolean
}) {
  const { group, user, canEdit } = props
  const [groupBannerUrl, setGroupBannerUrl] = useState(group.bannerUrl)
  const [changeBannerModalOpen, setChangeBannerModalOpen] = useState(false)
  return (
    <>
      <figure
        className={clsx(
          'group relative w-full',
          groupBannerUrl ? ' h-60 sm:h-72' : 'h-24'
        )}
      >
        <div className="absolute top-2 right-4 z-20 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          {user && canEdit && (
            <BannerDropdown
              group={group}
              open={changeBannerModalOpen}
              setOpen={setChangeBannerModalOpen}
              bannerUrl={groupBannerUrl}
              setBannerUrl={setGroupBannerUrl}
              user={user}
              onChangeBannerClick={() => setChangeBannerModalOpen(true)}
            />
          )}
        </div>
        {groupBannerUrl && (
          <Image src={groupBannerUrl} alt="" fill className="object-cover" />
        )}
      </figure>
    </>
  )
}

async function updateGroupBannerImage(group: Group, bannerUrl?: string) {
  if (!bannerUrl) {
    return
  }
  if (group.bannerUrl && group.bannerUrl === bannerUrl) {
    return
  }
  await updateGroup({ id: group.id, bannerUrl: bannerUrl })
}

export function ChangeBannerModal(props: {
  group: Group
  open: boolean
  setOpen: (open: boolean) => void
  bannerUrl: string | undefined
  setBannerUrl: (bannerUrl: string) => void
  user: User
}) {
  const { group, open, setOpen, bannerUrl, setBannerUrl, user } = props
  const [bannerSelection, setBannerSelection] = useState(bannerUrl)
  const [fileUrl, setFileUrl] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(undefined)
  const [fileLoading, setFileLoading] = useState(false)
  const fileHandler = async (event: any) => {
    const file = event.target.files[0]

    setFileLoading(true)

    await uploadImage(user.username, file)
      .then(async (url) => {
        setError(undefined)
        setFileUrl(url)
        setBannerSelection(url)
        setFileLoading(false)
      })
      .catch((e) => {
        setError(e)
        setFileLoading(false)
      })
  }

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}>
        <div className="text-xl">Change banner photo</div>
        <Row className="w-full gap-4">
          {DEFAULT_BANNERS.map((bannerUrl) => (
            <DefaultBannerIcon
              key={bannerUrl}
              src={bannerUrl}
              width="w-1/3"
              bannerSelection={bannerSelection}
              setBannerSelection={setBannerSelection}
            />
          ))}
        </Row>
        <Row className="w-full items-center">
          <div className="bg-ink-300 h-0.5 flex-1" />
          <div className="text-ink-300 px-2">OR</div>
          <div className="bg-ink-300 h-0.5 flex-1" />
        </Row>

        <Col className="w-full items-center gap-4">
          <div
            className={clsx(
              'bg-ink-200 h-40 w-full rounded ring-offset-2 transition-all',
              fileLoading ? 'animate-pulse' : '',
              fileUrl
                ? 'hover:ring-highlight-blue ring-opacity-50 hover:ring'
                : '',
              bannerSelection && bannerSelection === fileUrl
                ? 'ring-highlight-blue ring'
                : ''
            )}
            onClick={() => {
              if (fileUrl) {
                setBannerSelection(fileUrl)
              }
            }}
          >
            {!fileUrl && (
              <PhotographIcon className="text-ink-0 mx-auto mt-10 h-1/2" />
            )}
            {fileUrl && (
              <figure className="group relative h-full w-full">
                <Image src={fileUrl} alt="" fill className="object-cover" />
              </figure>
            )}
          </div>
          <input
            className="mx-auto"
            type="file"
            name="file"
            onChange={fileHandler}
          />
        </Col>
        <Row className="w-full justify-end gap-2">
          <Button color="gray" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              setLoading(true)
              await updateGroupBannerImage(group, bannerSelection)
                .then(() => {
                  if (bannerSelection) {
                    setBannerUrl(bannerSelection)
                  }
                  setOpen(false)
                })
                .catch((error) => setError(error))
              setLoading(false)
            }}
          >
            Save
          </Button>
        </Row>
        {error && (
          <Row className="justify-end">
            <div className="text-red-600">{error}</div>
          </Row>
        )}
      </Col>
    </Modal>
  )
}

function DefaultBannerIcon(props: {
  src: string
  width: string
  bannerSelection: string | undefined
  setBannerSelection: (bannerSelection: string) => void
}) {
  const { src, width, bannerSelection, setBannerSelection } = props
  return (
    <figure
      className={clsx('relative h-20', width)}
      onClick={() => setBannerSelection(src)}
    >
      <Image
        src={src}
        alt=""
        fill
        className={clsx(
          'rounded object-cover ring-offset-2 transition-all',
          bannerSelection === src
            ? 'ring-highlight-blue ring'
            : 'hover:ring-highlight-blue hover:ring hover:ring-opacity-50'
        )}
      />
    </figure>
  )
}

// TODO: add option to position photo
function BannerDropdown(props: {
  group: Group
  open: boolean
  setOpen: (open: boolean) => void
  bannerUrl: string | undefined
  setBannerUrl: (bannerUrl: string) => void
  user: User
  onChangeBannerClick: () => void
}) {
  const {
    group,
    open,
    setOpen,
    bannerUrl,
    setBannerUrl,
    user,
    onChangeBannerClick,
  } = props
  return (
    <>
      <DropdownMenu
        Items={[
          {
            name: 'Change banner photo',
            icon: <PhotographIcon className="h-5 w-5" />,
            onClick: onChangeBannerClick,
          },
        ]}
        Icon={<PencilIcon className="text-ink-900 h-5 w-5" />}
        buttonClass="rounded-md bg-canvas-0 bg-opacity-50 p-1"
        menuWidth="w-60"
      />
      <ChangeBannerModal
        group={group}
        open={open}
        setOpen={setOpen}
        bannerUrl={bannerUrl}
        setBannerUrl={setBannerUrl}
        user={user}
      />
    </>
  )
}
