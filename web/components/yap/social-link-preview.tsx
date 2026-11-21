import { useState } from 'react'
import { ExpandableImage } from 'web/components/widgets/expandable-image'
import { useLinkPreview } from 'web/hooks/use-link-previews'
import { getSocialLinks } from './social-text'
import { SocialLink } from './social-link'

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
    <div className="border-ink-200 dark:border-ink-300 mt-3 flex flex-col overflow-hidden rounded-xl border">
      {image && /^https?:\/\//i.test(image) && !imageFailed && (
        <ExpandableImage
          src={image}
          alt=""
          buttonLabel="Expand link preview image"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="block h-auto max-h-64 max-w-full"
        />
      )}
      <SocialLink
        href={url}
        className="hover:bg-canvas-50 block space-y-1 px-3 py-2.5"
      >
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
      </SocialLink>
    </div>
  )
}
