import { storage } from './init'
import { ref, getDownloadURL } from 'firebase/storage'
import { uploadPublicImage } from './storage'

export const STONK_IMAGES_PATH = 'stonk-images'

export async function uploadStonkImage(contractId: string, file: File) {
  // Get file extension from original file
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  
  // Create a new file with the contract ID as the name
  const newFile = new File([file], `${contractId}.${ext}`, {
    type: file.type
  })

  // Upload using existing helper
  const imageUrl = await uploadPublicImage(
    'system',
    newFile,
    STONK_IMAGES_PATH
  )

  return imageUrl
}

export async function getStonkImageUrl(contractId: string) {
  const imageRef = ref(storage, `${STONK_IMAGES_PATH}/${contractId}`)
  try {
    return await getDownloadURL(imageRef)
  } catch (error) {
    return null
  }
} 