import clsx from 'clsx'
import { useState } from 'react'
import { FaUser } from 'react-icons/fa'
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
    <div className="bg-ink-300 relative mr-4 h-16 w-16 shrink-0 overflow-hidden rounded-lg object-cover shadow-sm sm:h-20 sm:w-20">
      <label className="group h-full w-full cursor-pointer">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />

        <FaUser className="text-ink-500 mx-auto mt-[10%] h-3/4 w-3/4" />

        {/* Overlay */}
        <div
          className={clsx(
            'absolute inset-0 flex items-center justify-center text-center',
            'bg-ink-1000/50 rounded-lg text-sm text-white transition',
            uploading ? 'opacity-50' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          {uploading ? 'Uploading...' : 'Upload Image'}
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
