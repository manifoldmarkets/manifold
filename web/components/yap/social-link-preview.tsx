import { useState } from 'react'
import { useLinkPreview } from 'web/hooks/use-link-previews'
import { getSocialLinks } from './social-text'

export function SocialLinkPreview({ text }: { text: string }) {
  const url = getSocialLinks(text)[0]?.href

  // Remount when the URL changes so edits can't show the previous link's card.
  return url ? <LinkPreviewCard key={url} url={url} /> : null
}

function LinkPreviewCard({ url }: { url: string }) {
  const preview = useLinkPreview(url)
  const [imageFailed, setImageFailed] = useState(false)
  if (!preview) return null

  const image = preview.image
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer ugc"
      className="border-ink-200 dark:border-ink-300 hover:border-primary-400 hover:bg-canvas-50 mt-3 block overflow-hidden rounded-xl border transition-colors"
    >
      {image && /^https?:\/\//i.test(image) && !imageFailed && (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="bg-canvas-50 aspect-[1.91/1] max-h-64 w-full object-cover"
        />
      )}
      <div className="space-y-1 px-3 py-2.5">
        <div className="text-ink-600 truncate text-xs">
          {new URL(url).hostname}
        </div>
        <div className="text-ink-900 line-clamp-2 break-words text-sm font-medium [overflow-wrap:anywhere]">
          {preview.title || new URL(url).hostname}
        </div>
        {preview.description && (
          <div className="text-ink-600 line-clamp-2 break-words text-xs [overflow-wrap:anywhere]">
            {preview.description}
          </div>
        )}
      </div>
    </a>
  )
}
