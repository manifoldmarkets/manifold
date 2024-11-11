import { TrashIcon } from '@heroicons/react/solid'
import router from 'next/router'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { auth } from 'web/lib/firebase/users'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Col } from '../layout/col'
import { Input } from '../widgets/input'
import { Title } from '../widgets/title'
import { api } from 'web/lib/api/api'

export function DeleteYourselfButton(props: { username: string }) {
  const { username } = props

  const deleteAccount = async () => {
    await api('me/delete', { username })
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
        <div className="mb-2">
          Deleting your account means you will no longer be able to use your
          account.
        </div>
        <div className="mb-6">
          Your profile will be deleted, but people may still see your username,
          trades, and comments on markets. Please consider changing your
          username before deleting to mitigate this.
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
