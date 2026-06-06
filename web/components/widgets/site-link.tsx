import { isFaviconAllowed } from 'common/favicon-allowlist'

export const linkClass =
  'break-anywhere hover:underline hover:decoration-primary-400 hover:decoration-2 active:underline active:decoration-primary-400'

export const LinkFavicon = (props: { href: string }) => {
  let hostname: string | null = null
  try {
    hostname = new URL(props.href).hostname
  } catch {
    return null
  }
  if (!isFaviconAllowed(hostname)) return null
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      className="my-0 mr-1 inline h-[1em] w-[1em] align-text-bottom"
      onError={(e) => {
        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
      }}
    />
  )
}
