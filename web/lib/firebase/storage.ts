import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import imageCompression from 'browser-image-compression'
import { nanoid } from 'nanoid'
import { storage } from './init'

// TODO: compress large images
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
    return Promise.reject('File is over 20 MB.')
  }

  if (file.size > 1024 ** 2) {
    file = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
    })
  }

  const uploadTask = uploadBytesResumable(storageRef, file)

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
