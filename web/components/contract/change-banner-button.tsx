import { ArrowsExpandIcon, CameraIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import Image from 'next/image'
import { useState } from 'react'
import { Button, buttonClass } from '../buttons/button'
import { Modal } from '../layout/modal'
import { Tooltip } from '../widgets/tooltip'
import { updateContract } from 'web/lib/firebase/contracts'
import { dreamDefault } from '../editor/image-modal'
import { useUser } from 'web/hooks/use-user'
import { useAdmin } from 'web/hooks/use-admin'
import toast from 'react-hot-toast'
import { useMutation } from 'react-query'
import { uploadImage } from 'web/lib/firebase/storage'
import { FileUploadButton } from '../buttons/file-upload-button'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { TbCameraPlus } from 'react-icons/tb'

export function ChangeBannerButton(props: {
  contract?: Contract
  className?: string
}) {
  const { className, contract } = props

  const [open, setOpen] = useState(false)

  const user = useUser()
  const isCreator = user?.id === contract?.creatorId
  const isAdmin = useAdmin()
  const canEdit = isCreator || isAdmin
  const hasCoverImage = !!contract?.coverImageUrl

  return (
    <>
      <Tooltip
        text={
          canEdit
            ? hasCoverImage
              ? 'Change banner'
              : 'Add banner'
            : 'See full banner'
        }
        noTap
        className={className}
      >
        <button
          className={clsx(
            'flex p-2 transition-colors',
            hasCoverImage
              ? 'rounded-full bg-black/60 hover:bg-black/80'
              : 'text-ink-500 hover:text-ink-600'
          )}
          onClick={() => setOpen(true)}
        >
          {canEdit ? (
            hasCoverImage ? (
              <CameraIcon className="h-4 w-4" />
            ) : (
              <TbCameraPlus className="h-4 w-4" />
            )
          ) : (
            <ArrowsExpandIcon className="h-4 w-4" />
          )}
        </button>
      </Tooltip>
      {contract && (
        <ChangeBannerModal
          open={open}
          setOpen={setOpen}
          canEdit={canEdit}
          contract={contract}
        />
      )}
    </>
  )
}

const ChangeBannerModal = (props: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  canEdit: boolean
}) => {
  const { open, setOpen, contract, canEdit } = props

  const src = contract.coverImageUrl
  const [dreaming, setDreaming] = useState(false)
  async function redream() {
    setDreaming(true)
    const url = await dreamDefault(contract.question)
    await updateContract(contract.id, { coverImageUrl: url })
    setDreaming(false)
  }

  return (
    <Modal open={open} setOpen={setOpen}>
      <div className="flex flex-col items-center gap-2">
        <div className="bg-ink-100">
          {src != undefined ? (
            <Image src={src} width={400} height={400} alt="" />
          ) : (
            <div className="flex aspect-square w-[300px] shrink items-center justify-center sm:w-[400px]">
              No image
            </div>
          )}
        </div>

        {canEdit && (
          <div className="mb-2 flex justify-end gap-2">
            <ChangeCoverImageButton contract={contract} />
            <Button loading={dreaming} onClick={redream}>
              Redream
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

const ChangeCoverImageButton = (props: { contract: Contract }) => {
  const uploadMutation = useMutation(fileHandler, {
    onSuccess(url) {
      updateContract(props.contract.id, { coverImageUrl: url })
    },
    onError(error: any) {
      toast.error(error.message ?? error)
    },
  })

  return (
    <FileUploadButton
      onFiles={uploadMutation.mutate}
      className={buttonClass('md', 'indigo')}
      disabled={uploadMutation.isLoading}
    >
      {uploadMutation.isLoading && (
        <LoadingIndicator size="md" className="mr-2" />
      )}
      Change
    </FileUploadButton>
  )
}

const fileHandler = async (files: File[]) => {
  if (!files.length) throw new Error('No files selected')
  return await uploadImage('default', files[0])
}
