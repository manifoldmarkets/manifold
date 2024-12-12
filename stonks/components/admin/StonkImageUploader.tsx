import { useState } from 'react'
import { api } from 'web/lib/api/api'
import { uploadStonkImage } from 'web/lib/firebase/stonk-images'

export function StonkImageUploader({
  stonkId,
  question,
  onImageUploaded,
}: {
  stonkId: string
  question: string
  onImageUploaded?: (imageUrl: string) => void
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

      console.log('imageUrl', imageUrl)

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
    <div className="flex items-center gap-4 rounded border p-2">
      <div className="flex-1">
        <div className="text-sm text-gray-500">{stonkId}</div>
        <div className="text-xs text-gray-500">{question}</div>
      </div>

      <label className="relative">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
        <div
          className={`
          cursor-pointer rounded bg-blue-500 px-4 py-2 text-white
          ${uploading ? 'opacity-50' : 'hover:bg-blue-600'}
        `}
        >
          {uploading ? 'Uploading...' : 'Upload Image'}
        </div>
      </label>

      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  )
}
