import { ActivityIndicator } from 'react-native'
import { ProfileContent } from 'components/profile/profile-content'
import { useUser } from 'hooks/use-user'

export default function ProfilePage() {
  const user = useUser()

  if (!user) {
    return <ActivityIndicator />
  }

  return <ProfileContent user={user} />
}
