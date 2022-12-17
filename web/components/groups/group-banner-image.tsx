import { PencilIcon, PhotographIcon } from '@heroicons/react/solid'
import { Group } from 'common/group'
import { useState } from 'react'
import { DEFAULT_BANNER_URL } from 'web/pages/group/[...slugs]'
import DropdownMenu from '../comments/dropdown-menu'
import Image from 'next/image'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Col } from '../layout/col'

export default function BannerImage(props: { group: Group }) {
  const { group } = props
  const [groupBannerUrl, setGroupBannerUrl] = useState(
    group.bannerUrl ?? DEFAULT_BANNER_URL
  )
  const [changeBannerModalOpen, setChangeBannerModalOpen] = useState(false)
  return (
    <>
      <figure className="group relative h-60 w-full sm:h-72">
        <div className="absolute top-2 right-4 z-20 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <BannerDropdown
            onChangeBannerClick={() => setChangeBannerModalOpen(true)}
          />
        </div>
        <Image src={groupBannerUrl} alt="" fill={true} objectFit="cover" />
      </figure>
      <ChangeBannerModal
        open={changeBannerModalOpen}
        setOpen={setChangeBannerModalOpen}
      />
    </>
  )
}

export function ChangeBannerModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <div className="text-xl">Change banner image</div>
      </Col>
    </Modal>
  )
}

// TODO: add option to position photo
function BannerDropdown(props: { onChangeBannerClick: () => void }) {
  const { onChangeBannerClick } = props
  return (
    <DropdownMenu
      Items={[
        {
          name: 'Change banner photo',
          icon: <PhotographIcon className="h-5 w-5" />,
          onClick: onChangeBannerClick,
        },
      ]}
      Icon={<PencilIcon className="h-5 w-5 text-gray-900" />}
      buttonClass="rounded-md bg-white bg-opacity-50 p-1"
      MenuWidth="w-60"
    />
  )
}
