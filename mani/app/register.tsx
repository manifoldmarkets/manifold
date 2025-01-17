import Page from 'components/page'
import { RegisterContent } from 'components/register-content'
import { useLocalSearchParams } from 'expo-router'
import { usePrivateUser } from 'hooks/use-user'
import { useUser } from 'hooks/use-user'
import { Text } from 'react-native'

export default function Register() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const params = useLocalSearchParams<{ priceInDollars?: string }>()
  return (
    <Page>
      {!user || !privateUser ? (
        <Text>Loading...</Text>
      ) : (
        <RegisterContent
          user={user}
          privateUser={privateUser}
          redirect={params}
        />
      )}
    </Page>
  )
}
