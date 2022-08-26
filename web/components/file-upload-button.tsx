import { useRef } from 'react'

/** button that opens file upload window */
export function FileUploadButton(props: {
  onFiles: (files: File[]) => void
  className?: string
  children?: React.ReactNode
}) {
  const { onFiles, className, children } = props
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type={'button'}
        className={className}
        onClick={() => ref.current?.click()}
      >
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".gif,.jpg,.jpeg,.png,.webp, image/*"
        multiple
        className="hidden"
        onChange={(e) => onFiles(Array.from(e.target.files || []))}
      />
    </>
  )
}
