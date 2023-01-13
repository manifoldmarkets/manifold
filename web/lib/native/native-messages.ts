import { postMessageToNative } from 'web/components/native-message-listener'

export const nativePassUsers = (userJson: string) => {
  postMessageToNative('users', userJson)
}
export const nativeSignOut = () => {
  postMessageToNative('signOut', {})
}
