import { ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useAPIGetter } from 'hooks/use-api-getter'
import { ProfileContent } from 'components/profile/profile-content'

export default function ProfilePage() {
  const { username } = useLocalSearchParams()

  if (!username) {
    return <ActivityIndicator />
  }

  return <Profile username={username as string} />
}

function Profile(props: { username: string }) {
  const { username } = props
  const { data: user } = useAPIGetter('user/:username', {
    username: username,
  })
  if (!user) return <ActivityIndicator />

  return <ProfileContent user={user} />
}
