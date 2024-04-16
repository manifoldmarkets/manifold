import { TrashIcon } from '@heroicons/react/solid'
import { deleteField } from 'firebase/firestore'
import router from 'next/router'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { auth, updatePrivateUser, updateUser } from 'web/lib/firebase/users'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Col } from '../layout/col'
import { Input } from '../widgets/input'
import { Title } from '../widgets/title'

export function DeleteYourselfButton(props: { userId: string }) {
  const { userId } = props

  const deleteAccount = async () => {
    // if you change this, be sure to update firestore.rules. it's pretty exact to prevent self-unbanning. or better, turn this to API call
    await updateUser(userId, {
      userDeleted: true,
      isBannedFromPosting: true,
    })
    await updatePrivateUser(userId, {
      email: deleteField(),
      twitchInfo: deleteField(),
    } as any)
    await auth.signOut()
  }

  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState('')

  return (
    <ConfirmationButton
      openModalBtn={{
        className: 'p-2',
        label: 'Permanently delete this account',
        icon: <TrashIcon className="mr-1 h-5 w-5" />,
        color: 'red',
      }}
      submitBtn={{
        label: 'Delete account',
        color:
          deleteAccountConfirmation == 'delete my account' ? 'red' : 'gray',
      }}
      onSubmitWithSuccess={async () => {
        if (deleteAccountConfirmation == 'delete my account') {
          toast
            .promise(deleteAccount(), {
              loading: 'Deleting account...',
              success: () => {
                router.push('/')
                return 'Account deleted'
              },
              error: () => {
                return 'Failed to delete account'
              },
            })
            .then(() => {
              return true
            })
            .catch(() => {
              return false
            })
        }
        return false
      }}
    >
      <Col>
        <Title>Are you sure?</Title>
        <div>
          Deleting your account means you will no longer be able to use your
          account. You will lose access to all of your data.
        </div>
        <Input
          type="text"
          placeholder="Type 'delete my account' to confirm"
          className="w-full"
          value={deleteAccountConfirmation}
          onChange={(e) => setDeleteAccountConfirmation(e.target.value)}
        />
      </Col>
    </ConfirmationButton>
  )
}
