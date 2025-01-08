import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { app } from 'lib/firebase/init'
import * as FileSystem from 'expo-file-system'

const storage = getStorage(app)

export const uploadPrivateImage = async (
  userId: string,
  uri: string,
  fileName: string
): Promise<string> => {
  try {
    const storageRef = ref(storage, `private/${userId}/${fileName}`)

    // Convert URI to blob for React Native
    const response = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const byteCharacters = atob(response)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'image/jpeg' })

    await uploadBytes(storageRef, blob)
    const downloadURL = await getDownloadURL(storageRef)
    return downloadURL
  } catch (error) {
    console.error('Error uploading image:', error)
    throw error
  }
}
