import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { HeartIcon } from '@heroicons/react/solid'

export function MatchTracker(props: {
  lastResolved: number
  setStage: (stage: number) => void
  stage: number
}) {
  const { lastResolved, setStage, stage } = props
  console.log(stage)
  return (
    <Row className="items-center text-xs">
      {Array(4)
        .fill(null)
        .map((_, i) => (
          <>
            {i !== 0 && (
              <hr
                className={clsx(
                  'border-ink-200 dark:border-ink-400 flex flex-grow border-t-2 ',
                  i <= lastResolved + 1 ? '' : ' border-dashed'
                )}
              />
            )}

            <button
              key={i}
              onClick={() => setStage(i)}
              className={clsx(
                ' text-canvas-0 z-10 rounded-full text-xs transition-all ',
                stage == i
                  ? ' bg-primary-500 '
                  : 'bg-ink-200 dark:bg-ink-400 hover:bg-ink-300 hover:dark:bg-ink-500'
              )}
            >
              {i != 3 ? (
                <div className="h-4 w-5">{i + 1}</div>
              ) : (
                <HeartIcon className="mx-0.5 my-[1px] h-3.5 w-3.5" />
              )}
            </button>
          </>
        ))}
    </Row>
  )
}
