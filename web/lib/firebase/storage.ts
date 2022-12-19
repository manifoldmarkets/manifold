import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { nanoid } from 'nanoid'
import { storage } from './init'
import Compressor from 'compressorjs'

const ONE_YEAR_SECS = 60 * 60 * 24 * 365

export const uploadImage = async (
  username: string,
  file: File,
  onProgress?: (progress: number, isRunning: boolean) => void
) => {
  // Replace filename with a nanoid to avoid collisions
  const [, ext] = file.name.split('.')
  const filename = `${nanoid(10)}.${ext}`
  const storageRef = ref(storage, `user-images/${username}/${filename}`)

  if (file.size > 20 * 1024 ** 2) {
    return Promise.reject('File is over 20 MB')
  }

  // if  >1MB compress
  if (file.size > 1024 ** 2) {
    file = await new Promise((resolve, reject) => {
      new Compressor(file, {
        quality: 0.6,
        maxHeight: 1920,
        maxWidth: 1920,
        convertSize: 1000000, // if result >1MB turn to jpeg
        success: (file: File) => resolve(file),
        error: (error) => reject(error.message),
      })
    })
  }

  const uploadTask = uploadBytesResumable(storageRef, file, {
    cacheControl: `public, max-age=${ONE_YEAR_SECS}`,
  })

  let resolvePromise: (url: string) => void
  let rejectPromise: (reason?: any) => void

  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const unsubscribe = uploadTask.on(
    'state_changed',
    (snapshot) => {
      const progress = snapshot.bytesTransferred / snapshot.totalBytes
      const isRunning = snapshot.state === 'running'
      if (onProgress) onProgress(progress, isRunning)
    },
    (error) => {
      // A full list of error codes is available at
      // https://firebase.google.com/docs/storage/web/handle-errors
      rejectPromise(error)
      unsubscribe()
    },
    () => {
      getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
        resolvePromise(downloadURL)
      })

      unsubscribe()
    }
  )

  return await promise
}
