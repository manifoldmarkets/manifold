import { useState } from 'react'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { UserInfo } from 'web/components/gidx/user-info'
import clsx from 'clsx'
import { Page } from 'web/components/layout/page'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export const Registration = (props: {
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { open, setOpen } = props
  const user = useUser()
  const [error, setError] = useState<string | null>(null)
  // TODO: add phone verification step

  return (
    <Page trackPageView={'register user gidx'}>
      <Modal
        className={clsx(MODAL_CLASS, 'items-start')}
        open={open}
        setOpen={setOpen}
      >
        {/* We may be able to skip the location step if they've already logged their location*/}
        {!user ? <LoadingIndicator /> : <UserInfo user={user} />}
      </Modal>
      <h1 className="text-xl font-bold">User Location</h1>
    </Page>
  )
}
