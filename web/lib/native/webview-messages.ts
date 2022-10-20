export const webviewPassUsers = (userJson: string) => {
  if ((window as any).isNative) {
    ;(window as any).ReactNativeWebView.postMessage(userJson)
  }
}
export const webviewSignOut = () => {
  if ((window as any).isNative) {
    ;(window as any).ReactNativeWebView.postMessage('signOut')
  }
}
