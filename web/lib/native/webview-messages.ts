import { postMessageToNative } from 'web/components/native-message-listener'

export const webviewPassUsers = (userJson: string) => {
  postMessageToNative('users', userJson)
}
export const webviewSignOut = () => {
  postMessageToNative('signOut', {})
}
