import * as admin from 'firebase-admin'

import { getStorage, Storage } from 'firebase-admin/storage'
import { User } from 'common/user'
import { LIVE_DOMAIN } from 'common/envs/constants'

type Bucket = ReturnType<InstanceType<typeof Storage>['bucket']>

const firestore = admin.firestore()
export const generateAndUpdateAvatarUrls = async (users: User[]) => {
  const storage = getStorage()
  const bucket = storage.bucket()
  console.log('bucket name', bucket.name)

  await Promise.all(
    users.map(async (user) => {
      const userDoc = firestore.collection('users').doc(user.id)
      console.log('backfilling user avatar:', user.id)
      const avatarUrl = await generateAvatarUrl(user.id, user.name, bucket)
      await userDoc.update({ avatarUrl })
    })
  )
}

export const generateAvatarUrl = async (
  userId: string,
  name: string,
  bucket: Bucket
) => {
  const backgroundColors = [
    '#FF8C00',
    '#800080',
    '#00008B',
    '#008000',
    '#A52A2A',
    '#555555',
    '#008080',
  ]
  const imageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=${encodeURIComponent(
    backgroundColors[Math.floor(Math.random() * backgroundColors.length)]
  )}&color=fff&size=256&format=png`
  try {
    const res = await fetch(imageUrl)
    const buffer = await res.arrayBuffer()
    return await upload(userId, Buffer.from(buffer), bucket)
  } catch (e) {
    console.log('error generating avatar', e)
    return `https://${LIVE_DOMAIN}/images/default-avatar.png`
  }
}

async function upload(userId: string, buffer: Buffer, bucket: Bucket) {
  const filename = `user-images/${userId}.png`
  let file = bucket.file(filename)

  const exists = await file.exists()
  if (exists[0]) {
    await file.delete()
    file = bucket.file(filename)
  }
  await file.save(buffer, {
    private: false,
    public: true,
    metadata: { contentType: 'image/png' },
  })
  return `https://storage.googleapis.com/${bucket.cloudStorageURI.hostname}/${filename}`
}
