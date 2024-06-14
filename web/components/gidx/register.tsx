import { UserInfo } from 'web/components/gidx/user-info'
import { Page } from 'web/components/layout/page'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export const Registration = (props: {
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { open, setOpen } = props
  const user = useUser()

  return (
    <Page trackPageView={'register user gidx'}>
      {!user ? (
        <LoadingIndicator />
      ) : (
        <UserInfo setOpen={setOpen} user={user} />
      )}
    </Page>
  )
}
