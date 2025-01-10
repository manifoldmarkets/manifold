import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { privateStorage } from './init'

export const uploadPrivateImage = async (
  userId: string,
  uri: string,
  fileName: string
): Promise<string> => {
  try {
    const storageRef = ref(
      privateStorage,
      `private-images/${userId}/${fileName}`
    )

    // Fetch the image and get it as a blob
    const response = await fetch(uri)
    const blob = await response.blob()

    await uploadBytes(storageRef, blob)
    return getDownloadURL(storageRef)
  } catch (error) {
    console.error('Error uploading image:', error)
    throw error
  }
}
