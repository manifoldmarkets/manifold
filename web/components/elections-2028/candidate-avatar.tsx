import clsx from 'clsx'
import Image from 'next/image'

import { CandidateInfo, CandidateParty } from 'web/lib/politics/candidates'
import { PHOTO_CREDITS, photoCreditText } from 'web/lib/politics/photo-credits'

// A candidate's face in a circle, ringed in their series colour with a thin
// surface-coloured gap so it stays legible where it overlaps a line. Without
// a photo: initials on a party tint. Exactly `size` px across.
export function CandidateAvatar(props: {
  candidate: CandidateInfo
  size: number
  ringColor?: string
  party?: CandidateParty
  className?: string
}) {
  const { candidate, size, ringColor, party, className } = props
  const ring = ringColor ? (size >= 28 ? 2 : 1.5) : 0
  const gap = ringColor ? 1.5 : 0
  const photoSize = size - 2 * (ring + gap)
  const credit = candidate.photo ? PHOTO_CREDITS[candidate.photo] : undefined
  return (
    <span
      className={clsx('inline-flex shrink-0 rounded-full', className)}
      style={{
        width: size,
        height: size,
        padding: ring,
        backgroundColor: ringColor,
      }}
      title={
        credit
          ? `${candidate.name}. ${photoCreditText(credit)}`
          : candidate.name
      }
    >
      <span
        className="bg-canvas-0 flex h-full w-full rounded-full"
        style={{ padding: gap }}
      >
        <span
          className={clsx(
            'relative block h-full w-full overflow-hidden rounded-full',
            party === 'D'
              ? 'bg-[#dbe4f5] dark:bg-[#26324f]'
              : party === 'R'
              ? 'bg-[#f5dede] dark:bg-[#4a2528]'
              : 'bg-ink-200'
          )}
        >
          {candidate.photo ? (
            <Image
              src={candidate.photo}
              alt=""
              fill
              sizes={`${Math.ceil(photoSize * 2)}px`}
              className="object-cover object-top"
            />
          ) : (
            <span
              className="text-ink-700 flex h-full w-full items-center justify-center font-semibold"
              style={{ fontSize: Math.max(8, photoSize * 0.4) }}
              aria-hidden
            >
              {candidate.initials}
            </span>
          )}
        </span>
      </span>
    </span>
  )
}

// The licence credits for the Creative Commons photos among `candidates`, as
// one quiet line under the section that shows them. Nothing when every face
// shown is a public-domain portrait.
export function PhotoCredits(props: {
  candidates: CandidateInfo[]
  className?: string
}) {
  const seen = new Set<string>()
  const credited = props.candidates.filter((c) => {
    if (!c.photo || !PHOTO_CREDITS[c.photo] || seen.has(c.photo)) return false
    seen.add(c.photo)
    return true
  })
  if (credited.length === 0) return null
  return (
    <p
      className={clsx(
        'text-ink-500 text-[11px] leading-relaxed',
        props.className
      )}
    >
      Photos:{' '}
      {credited.map((c, i) => {
        const credit = PHOTO_CREDITS[c.photo!]
        return (
          <span key={c.photo}>
            {i > 0 && '; '}
            {c.name} by{' '}
            <a
              href={credit.source}
              className="hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {credit.author}
            </a>{' '}
            (
            <a
              href={credit.licenseUrl}
              className="hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {credit.license}
            </a>
            )
          </span>
        )
      })}
      , cropped.
    </p>
  )
}
