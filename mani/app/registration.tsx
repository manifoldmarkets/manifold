import { RegistrationPage } from 'components/registration-page'
import Page from 'components/page'
import { usePrivateUser } from 'hooks/use-user'
import { useUser } from 'hooks/use-user'
import { Text } from 'react-native'
export default function Registration() {
  const user = useUser()
  const privateUser = usePrivateUser()
  return (
    <Page>
      {!user || !privateUser ? (
        <Text>Loading...</Text>
      ) : (
        <RegistrationPage user={user} privateUser={privateUser} />
      )}
    </Page>
  )
}
