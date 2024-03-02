import { useEffect, useState } from 'react'
import { CheckIcon, XIcon, PencilIcon } from '@heroicons/react/solid'
import { IconButton } from '../buttons/button'
import { updatePrivateUser, getPrivateUser } from 'web/lib/firebase/users'

type EditablePaymentInfoProps = {
  userId: string
}

export const EditablePaymentInfo = ({ userId }: EditablePaymentInfoProps) => {
  const [isEditing, setEditing] = useState(false)
  const [paymentInfo, setPaymentInfo] = useState('')

  useEffect(() => {
    const getPaymentInfo = async () => {
      try {
        const userData = await getPrivateUser(userId)
        if (userData && userData.paymentInfo) {
          setPaymentInfo(userData.paymentInfo)
        }
      } catch (error) {
        console.error('Failed to fetch payment info', error)
      }
    }

    getPaymentInfo()
  }, [userId])

  const edit = () => {
    setEditing(true)
  }

  const onSave = async (newPaymentInfo: string) => {
    await updatePrivateUser(userId, {
      paymentInfo: newPaymentInfo,
    })
    setEditing(false)
  }

  return isEditing ? (
    <div className="flex items-center gap-2">
      <input
        className="grow"
        type="text"
        maxLength={60}
        value={paymentInfo}
        onChange={(e) => setPaymentInfo(e.target.value || '')}
        autoFocus
      />
      <IconButton onClick={() => onSave(paymentInfo)} className="p-1">
        <CheckIcon className="h-4 w-4 text-teal-600" />
      </IconButton>
      <IconButton onClick={() => setEditing(false)} className="p-1">
        <XIcon className="text-scarlet-400 h-4 w-4" />
      </IconButton>
    </div>
  ) : (
    <div className="text-md flex items-center">
      <span>{paymentInfo}</span>
      <button
        onClick={edit}
        className="align-center hover:bg-ink-100 hover:text-ink-600 text-ink-500 ml-1 rounded p-1 transition-colors sm:group-hover:inline"
      >
        <PencilIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
