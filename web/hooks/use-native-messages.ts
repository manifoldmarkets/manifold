import { useEffect } from 'react'
import { nativeToWebMessageType } from 'common/native-message'

export const useNativeMessages = (
  messageTypes: nativeToWebMessageType[],
  onMessageReceived: (type: string, data: any) => void
) => {
  const handleNativeMessage = async (e: any) => {
    let event
    try {
      event = JSON.parse(e.data)
    } catch (e) {
      return
    }
    const { type, data } = event
    console.log('Received native event: ', event)
    if (messageTypes.includes(type)) {
      onMessageReceived(type, data)
    }
  }

  useEffect(() => {
    document.addEventListener('message', handleNativeMessage)
    window.addEventListener('message', handleNativeMessage)
    return () => {
      document.removeEventListener('message', handleNativeMessage)
      window.removeEventListener('message', handleNativeMessage)
    }
  }, [])
}
