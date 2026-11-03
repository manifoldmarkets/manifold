import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { ArrowsExpandIcon, XIcon } from '@heroicons/react/outline'

import { DOMAIN } from 'common/envs/constants'
import { ScheduleItem } from './tv-schedule'

export function tvStreamSrc(stream?: ScheduleItem) {
  if (stream?.source === 'twitch') {
    return `https://player.twitch.tv/?channel=${stream.stream_id}&parent=${DOMAIN}&autoplay=true`
  } else if (stream?.source === 'youtube') {
    return 'https://www.youtube.com/embed/' + stream?.stream_id + '?autoplay=1'
  } else if (stream?.source === 'twitter') {
    return `https://platform.twitter.com/embed/Tweet.html?dnt=false&embedId=twitter-widget-0&features=eyJ0ZndfdGltZWxpbmVfbGlzdCI6eyJidWNrZXQiOltdLCJ2ZXJzaW9uIjpudWxsfSwidGZ3X2ZvbGxvd2VyX2NvdW50X3N1bnNldCI6eyJidWNrZXQiOnRydWUsInZlcnNpb24iOm51bGx9LCJ0ZndfdHdlZXRfZWRpdF9iYWNrZW5kIjp7ImJ1Y2tldCI6Im9uIiwidmVyc2lvbiI6bnVsbH0sInRmd19yZWZzcmNfc2Vzc2lvbiI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9LCJ0ZndfZm9zbnJfc29mdF9pbnRlcnZlbnRpb25zX2VuYWJsZWQiOnsiYnVja2V0Ijoib24iLCJ2ZXJzaW9uIjpudWxsfSwidGZ3X21peGVkX21lZGlhXzE1ODk3Ijp7ImJ1Y2tldCI6InRyZWF0bWVudCIsInZlcnNpb24iOm51bGx9LCJ0ZndfZXhwZXJpbWVudHNfY29va2llX2V4cGlyYXRpb24iOnsiYnVja2V0IjoxMjA5NjAwLCJ2ZXJzaW9uIjpudWxsfSwidGZ3X3Nob3dfYmlyZHdhdGNoX3Bpdm90c19lbmFibGVkIjp7ImJ1Y2tldCI6Im9uIiwidmVyc2lvbiI6bnVsbH0sInRmd19kdXBsaWNhdGVfc2NyaWJlc190b19zZXR0aW5ncyI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9LCJ0ZndfdXNlX3Byb2ZpbGVfaW1hZ2Vfc2hhcGVfZW5hYmxlZCI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9LCJ0ZndfdmlkZW9faGxzX2R5bmFtaWNfbWFuaWZlc3RzXzE1MDgyIjp7ImJ1Y2tldCI6InRydWVfYml0cmF0ZSIsInZlcnNpb24iOm51bGx9LCJ0ZndfbGVnYWN5X3RpbWVsaW5lX3N1bnNldCI6eyJidWNrZXQiOnRydWUsInZlcnNpb24iOm51bGx9LCJ0ZndfdHdlZXRfZWRpdF9mcm9udGVuZCI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9fQ%3D%3D&frame=false&hideCard=false&hideThread=false&id=${stream.stream_id}&lang=en&maxWidth=1000px&maxHeight=300px&origin=https%3A%2F%2Fpublish.twitter.com%2F%23&sessionId=6def12a89bdb0d99bf58197bc34012a9f3f22936&theme=light&widgetsVersion=2615f7e52b7e0%3A1702314776716`
  }
  return ''
}

// The stream, kept in view while the viewer scrolls to the markets: pinned to
// the top on phones, and on wider screens a mini player in the corner once
// its slot scrolls away. Only the wrapper's classes change, never the
// iframe's place in the DOM, so the stream never reloads.
export function TVStreamPlayer(props: {
  stream?: ScheduleItem
  className?: string
}) {
  const { stream, className } = props
  const isVideo = stream?.source !== 'twitter'

  const slotRef = useRef<HTMLDivElement>(null)
  const [outOfView, setOutOfView] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const slot = slotRef.current
    if (!slot || !isVideo) return
    const observer = new IntersectionObserver(
      ([entry]) => setOutOfView(!entry.isIntersecting),
      { threshold: 0.25 }
    )
    observer.observe(slot)
    return () => observer.disconnect()
  }, [isVideo])

  useEffect(() => {
    if (!outOfView) setDismissed(false)
  }, [outOfView])

  const mini = isVideo && outOfView && !dismissed

  return (
    <div
      ref={slotRef}
      className={clsx(
        'bg-canvas-0 w-full',
        isVideo
          ? // Sticky under 768px; the mini player takes over from md up.
            'sticky top-0 z-40 aspect-video md:static md:z-auto'
          : 'h-[300px] lg:h-[500px]',
        className
      )}
    >
      <div
        className={clsx(
          mini
            ? 'fixed bottom-4 left-4 z-50 hidden aspect-video w-[360px] overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10 md:block'
            : 'relative h-full w-full'
        )}
      >
        <iframe
          src={tvStreamSrc(stream)}
          title="Manifold Live video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="bg-canvas-0 h-full w-full"
        />
        {mini && (
          <div className="absolute right-1 top-1 flex gap-1">
            <button
              className="rounded bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label="Back to the stream"
              title="Back to the stream"
              onClick={() =>
                slotRef.current?.scrollIntoView({
                  block: 'start',
                  behavior: 'smooth',
                })
              }
            >
              <ArrowsExpandIcon className="h-4 w-4" />
            </button>
            <button
              className="rounded bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label="Close the mini player"
              title="Close the mini player"
              onClick={() => setDismissed(true)}
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
