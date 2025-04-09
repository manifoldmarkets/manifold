import { Storage } from 'firebase-admin/storage'
import { DOMAIN } from 'common/envs/constants'
import { nanoid } from 'nanoid'
import { log } from 'shared/utils'
type Bucket = ReturnType<InstanceType<typeof Storage>['bucket']>

export const generateAvatarUrl = async (
  userId: string,
  name: string,
  bucket: Bucket,
  randomName?: boolean
) => {
  const backgroundColors = [
    '#FF8C00', // Dark Orange
    '#800080', // Purple
    '#00008B', // Dark Blue
    '#008000', // Green
    '#008080', // Teal
    '#4B0082', // Indigo
    '#DC143C', // Crimson
    '#2E8B57', // Sea Green
    '#9932CC', // Dark Orchid
    '#483D8B', // Dark Slate Blue
    '#CD5C5C', // Indian Red
    '#6A5ACD', // Slate Blue
    '#20B2AA', // Light Sea Green
    '#B22222', // Fire Brick
    '#4682B4', // Steel Blue
    '#5F9EA0', // Cadet Blue
  ]
  const imageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=${encodeURIComponent(
    backgroundColors[Math.floor(Math.random() * backgroundColors.length)]
  )}&color=fff&size=256&format=png`
  try {
    const res = await fetch(imageUrl)
    const buffer = await res.arrayBuffer()
    return await upload(
      randomName ? nanoid(8) : userId,
      Buffer.from(buffer),
      bucket
    )
  } catch (e) {
    log.error('error generating avatar', { e })
    return `https://${DOMAIN}/images/default-avatar.png`
  }
}

async function upload(fileName: string, buffer: Buffer, bucket: Bucket) {
  const location = `user-images/${fileName}.png`
  let file = bucket.file(location)

  const exists = await file.exists()
  if (exists[0]) {
    await file.delete()
    file = bucket.file(location)
  }
  await file.save(buffer, {
    private: false,
    public: true,
    metadata: { contentType: 'image/png' },
  })
  return `https://storage.googleapis.com/${bucket.cloudStorageURI.hostname}/${location}`
}
