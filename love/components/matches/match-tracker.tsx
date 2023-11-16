import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { HeartIcon } from '@heroicons/react/solid'
import { Answer } from 'common/answer'
import { Col } from 'web/components/layout/col'

const shortStage = ['1st', '2nd', '3rd', '6mo']

// export function MatchTracker(props: {
//   lastResolved: number
//   setStage: (stage: number) => void
//   stage: number
// }) {
//   const { lastResolved, setStage, stage } = props
//   console.log(stage)
//   return (
//     <Row className="items-center text-xs">
//       {Array(4)
//         .fill(null)
//         .map((_, i) => (
//           <>
//             {i !== 0 && (
//               <hr
//                 className={clsx(
//                   'flex flex-grow border-t-2 ',
//                   i <= lastResolved + 1
//                     ? 'border-primary-200 dark:border-primary-50'
//                     : ' border-ink-200 dark:border-ink-400 border-dashed '
//                 )}
//               />
//             )}

//             <button
//               key={i}
//               onClick={() => setStage(i)}
//               className={clsx(
//                 ' text-canvas-0 z-10 rounded-full text-xs transition-all ',
//                 stage == i
//                   ? ' bg-primary-500 '
//                   : i <= lastResolved
//                   ? 'bg-primary-200 dark:bg-primary-50 hover:dark:bg-primary-100 hover:bg-primary-300'
//                   : 'bg-ink-200 dark:bg-ink-400 hover:bg-ink-300 hover:dark:bg-ink-500'
//               )}
//             >
//               {i != 3 ? (
//                 <div className="h-4 w-5">{i + 1}</div>
//               ) : (
//                 <HeartIcon className="mx-0.5 my-[1px] h-3.5 w-3.5" />
//               )}
//             </button>
//           </>
//         ))}
//     </Row>
//   )
// }

export function MatchTracker(props: {
  lastResolved: number
  setStage: (stage: number) => void
  stage: number
  answers: Answer[]
}) {
  const { lastResolved, setStage, stage, answers } = props
  console.log(stage)
  return (
    <Row className="items-center text-xs">
      {Array(4)
        .fill(null)
        .map((_, i) => (
          <>
            {/* <Col className="relative grow"> */}
            <button
              key={i}
              onClick={() => setStage(i)}
              // className={clsx(
              //   ' text-canvas-0 z-10 rounded-full text-xs transition-all ',
              //   stage == i
              //     ? ' bg-primary-500 '
              //     : i <= lastResolved
              //     ? 'bg-primary-200 dark:bg-primary-50 hover:dark:bg-primary-100 hover:bg-primary-300'
              //     : 'bg-ink-200 dark:bg-ink-400 hover:bg-ink-300 hover:dark:bg-ink-500'
              // )}
              className={clsx(
                'relative flex-grow transition-colors',
                stage == i ? 'font-semibold' : '',
                answers[i].resolution == 'YES'
                  ? 'text-teal-400 hover:text-teal-500 dark:text-teal-300 dark:hover:text-teal-400'
                  : answers[i].resolution == 'NO'
                  ? 'text-scarlet-400 hover:text-scarlet-500 dark:text-scarlet-300 dark:hover:text-scarlet-400'
                  : 'text-ink-500 hover:text-ink-600'
              )}
            >
              {shortStage[i]}
              <hr
                className={clsx(
                  'border-ink-100 dark:border-ink-300 absolute inset-x-0 -bottom-1 transition-all'
                )}
              />
              <hr
                className={clsx(
                  'border-primary-500 absolute inset-x-0 -bottom-[4.5px] rounded border-[1px] transition-all',
                  i == stage ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          </>
        ))}
    </Row>
  )
}
