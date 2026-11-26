import clsx from 'clsx'

import { Tooltip } from '../widgets/tooltip'

const description = 'Its author marked this comment as written by AI'

// A quiet tag for comments their author marked as written by AI. Unlike the
// mod label it adds no color, so the comment itself is not highlighted.
export function AiCommentLabel(props: { className?: string }) {
  return (
    <Tooltip
      text={description}
      className={clsx(
        'pointer-events-auto inline-flex shrink-0',
        props.className
      )}
    >
      <span
        aria-hidden="true"
        className="bg-ink-100 text-ink-600 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-medium leading-4"
      >
        AI comment
      </span>
      <span className="sr-only">{description}</span>
    </Tooltip>
  )
}
