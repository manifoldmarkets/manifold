/* eslint-disable jsx-a11y/alt-text */
import clsx from 'clsx'
import { OgAnswer, OgCardProps } from 'common/contract-seo'
import { base64toFloat32Points, base64toPoints, Point } from 'common/edge/og'
import Logo from 'web/public/logo.svg'
import { ProbGraph } from './graph'

// Shown at the bottom of every market card in social link previews
export const OG_TAGLINE = 'Play-money prediction markets · Create your own'

// See https://github.com/vercel/satori#documentation for styling restrictions
export function OgMarket(props: OgCardProps) {
  const {
    v,
    question,
    creatorName,
    creatorAvatarUrl,
    probability,
    numericValue,
    resolution,
    topAnswer,
    points,
    bountyLeft,
    outcomeType,
    perpPrice,
  } = props
  const isPerp = outcomeType === 'PERP'
  const probabilityAsFloat = probability
    ? parseFloat(probability.replace('%', ''))
    : undefined
  // Unversioned URLs (still cached by platforms) encoded points as float64
  const data: Point[] = points
    ? v
      ? base64toFloat32Points(points)
      : base64toPoints(points)
    : []
  const numTraders = Number(props.numTraders ?? 0)
  // Float32 timestamps can collapse to one value for markets only minutes old
  const showGraph = data.length >= 2 && data[0].x !== data[data.length - 1].x
  // A canceled market shows the "Canceled" state instead of answer bars
  const answers =
    resolution === 'CANCEL'
      ? []
      : parseAnswers(props.answers) ??
        (topAnswer ? [{ t: topAnswer, p: probability ?? '' }] : [])

  return (
    <div
      className="relative flex h-full w-full flex-col items-stretch bg-indigo-700"
      style={{
        backgroundImage: 'linear-gradient(to bottom, #4338ca, #818cf8)',
      }}
    >
      {/* Manifold logo */}
      <div className="mx-auto flex items-center">
        <Logo stroke="#ffffff" width={48} height={48} />

        <span
          className="ml-0.5 text-3xl font-thin uppercase text-white"
          style={{ fontFamily: 'var(--font-main), Figtree-light' }}
        >
          Manifold
        </span>
      </div>
      <div
        className={clsx(
          // Auto margins center a short card between the header and the tagline
          'mx-4 my-auto flex flex-col rounded-lg bg-white px-6 py-4 text-black shadow-lg',
          // Leave room for the absolutely positioned outcome row
          answers.length ? 'pb-4' : 'pb-10'
        )}
      >
        {/* Details */}
        <div className="mb-1 flex w-full flex-row justify-between text-sm text-gray-600">
          <div className="flex items-center">
            {/* Profile image */}
            {creatorAvatarUrl && (
              <img
                className="mr-1 h-5 w-5 rounded-full bg-white"
                src={creatorAvatarUrl}
              />
            )}
            <span>{creatorName}</span>
          </div>
          {!!numTraders && (
            <div className={'flex items-center'}>
              <svg
                className="mr-0.5 h-4 w-4 text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                  clipRule="evenodd"
                />
              </svg>

              {numTraders.toLocaleString('en-US')}
            </div>
          )}
        </div>
        <div
          className={clsx(
            'flex max-h-[90px] overflow-hidden leading-tight text-black',
            questionSizeClass(question)
          )}
        >
          {question}
        </div>
        {answers.length ? (
          <Answers answers={answers} />
        ) : showGraph ? (
          <div className="flex w-full shrink justify-center">
            <ProbGraph
              color={numericValue || isPerp ? '#14bbFF' : '#14b8a6'}
              data={data}
              height={80}
              aspectRatio={6.5}
              bottomInset={28}
              percentAxis={!numericValue && !isPerp}
            />
          </div>
        ) : bountyLeft ? (
          <BountyLeft bountyLeft={bountyLeft} />
        ) : (
          <div className="flex h-8" />
        )}
        {!answers.length &&
          (isPerp || probability || numericValue || resolution) && (
            <div className="absolute bottom-0 mb-4 mt-8 flex w-full flex-row justify-center self-center text-2xl text-white">
              {isPerp ? (
                <PerpValue price={perpPrice} />
              ) : probabilityAsFloat && !resolution ? (
                <>
                  <div
                    className={
                      'mr-4 flex h-12 w-1/2 items-center justify-center rounded-lg bg-teal-500'
                    }
                  >
                    Yes {probabilityAsFloat.toFixed(0)}%
                  </div>
                  <div
                    className={
                      'flex h-12 w-1/2 items-center justify-center rounded-lg bg-red-500'
                    }
                  >
                    No {(100 - probabilityAsFloat).toFixed(0)}%
                  </div>
                </>
              ) : resolution ? (
                <Resolution
                  resolution={resolution}
                  label={numericValue ?? probability}
                />
              ) : numericValue ? (
                <EndValue value={numericValue} label="expected" />
              ) : probability ? (
                <EndValue value={probability} label="chance" />
              ) : null}
            </div>
          )}
      </div>
      {/* Tagline: heads off "isn't this gambling?" reactions to link previews */}
      <div className="flex h-7 shrink-0 items-center justify-center text-base text-white">
        {OG_TAGLINE}
      </div>
    </div>
  )
}

// Step the font down for long questions instead of clipping them.
// Questions are capped at 120 chars; the last step only covers legacy markets.
function questionSizeClass(question: string) {
  const { length } = question
  return length <= 88 ? 'text-2xl' : length <= 150 ? 'text-xl' : 'text-lg'
}

function parseAnswers(json: string | undefined): OgAnswer[] | undefined {
  if (!json) return undefined
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) && parsed.length ? parsed : undefined
  } catch {
    return undefined
  }
}

function PerpValue(props: { price?: string }) {
  const { price } = props

  return (
    <div className="flex flex-col items-center justify-center text-black">
      {price && <span className="text-3xl">{price}</span>}
      <span className={price ? 'text-xl' : 'text-3xl'}>Perpetual market</span>
    </div>
  )
}

function Answers(props: { answers: OgAnswer[] }) {
  return (
    <div className="mt-2 flex w-full flex-col">
      {props.answers.map((answer, i) => (
        <AnswerRow key={i} answer={answer} first={i === 0} />
      ))}
    </div>
  )
}

function AnswerRow(props: { answer: OgAnswer; first: boolean }) {
  const { t: text, p: percent, w: isWinner } = props.answer
  const percentAsFloat = parseFloat(percent) || 0
  const fill = isWinner ? '#ccfbf1' : '#e0e7ff'

  return (
    <div
      className={clsx(
        'flex w-full flex-row items-center justify-between rounded px-3 py-0.5 text-base text-black',
        !props.first && 'mt-1'
      )}
      style={{
        backgroundImage: `linear-gradient(to right, ${fill} ${percentAsFloat}%, #f3f4f6 ${percentAsFloat}%)`,
      }}
    >
      <div className="mr-3 flex max-h-6 overflow-hidden">{text}</div>
      <div
        className={clsx(
          'flex shrink-0 font-semibold',
          isWinner && 'text-teal-700'
        )}
      >
        {percent}
      </div>
    </div>
  )
}

function EndValue(props: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-black">
      <span className="text-3xl">{props.value}</span>
      <span className="text-xl">{props.label}</span>
    </div>
  )
}

function Resolution(props: { resolution: string; label?: string }) {
  const { resolution, label } = props

  const text = {
    YES: 'Yes',
    NO: 'No',
    MKT: label ?? 'Many',
    CANCEL: 'Canceled',
  }[resolution]

  const color = {
    YES: 'bg-teal-500',
    NO: 'bg-red-600',
    MKT: 'bg-blue-500',
    CANCEL: 'bg-amber-400',
  }[resolution]

  return (
    <div
      className={`flex min-w-[15rem] flex-col rounded-lg px-12 py-2 text-white ${color} items-center justify-center`}
    >
      <span className="text-2xl">{text}</span>
    </div>
  )
}

function BountyLeft(props: { bountyLeft: string }) {
  const { bountyLeft } = props
  return (
    <div className="mx-auto flex flex-col text-center text-6xl text-gray-700">
      <span className="mx-auto flex flex-row">M{bountyLeft}</span>
      <span className="mx-auto text-xl text-gray-600">bounty</span>
    </div>
  )
}
