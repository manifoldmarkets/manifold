import clsx from 'clsx'
import { useState } from 'react'
import { FaUserCircle } from 'react-icons/fa'
import { api } from 'web/lib/api/api'
import { uploadStonkImage } from 'web/lib/firebase/stonk-images'

export function StonkImageUploader({
  stonkId,
  onImageUploaded,
  className,
}: {
  stonkId: string
  onImageUploaded?: (imageUrl: string) => void
  className?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string>()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      setError(undefined)

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file')
      }

      // Validate file size (e.g., 5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be less than 5MB')
      }

      const imageUrl = await uploadStonkImage(stonkId, file)

      await api('create-stonk-image', {
        contractId: stonkId,
        imageUrl,
      })

      onImageUploaded?.(imageUrl)
    } catch (err) {
      console.error('Failed to upload image:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative mr-2 h-24 w-24 shrink-0">
      <label className="group cursor-pointer">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />

        <div className="relative h-24 w-24 rounded-full bg-gray-200 dark:bg-gray-800">
          <FaUserCircle className="h-full w-full text-gray-400" />

          {/* Overlay */}
          <div
            className={clsx(
              'absolute inset-0 flex items-center justify-center',
              'rounded-full bg-black/50 text-sm text-white transition',
              uploading ? 'opacity-50' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            {uploading ? 'Uploading...' : 'Upload Image'}
          </div>
        </div>
      </label>

      {error && (
        <div className="absolute -bottom-6 w-full text-center text-sm text-red-500">
          {error}
        </div>
      )}
    </div>
  )
}
