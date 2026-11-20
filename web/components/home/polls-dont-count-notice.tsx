import clsx from 'clsx'
import { InformationCircleIcon } from '@heroicons/react/solid'

import { Row } from 'web/components/layout/row'

// Polls don't count toward the weekly market creation quests (the backend
// skips them), so say so wherever people see those quests or make a poll.
export function PollsDontCountNotice(props: { className?: string }) {
  return (
    <Row
      className={clsx(
        props.className,
        'bg-canvas-50 ring-ink-200 text-ink-700 items-start gap-2 rounded-md px-3 py-2 text-sm ring-1'
      )}
    >
      <InformationCircleIcon className="text-ink-500 mt-0.5 h-4 w-4 shrink-0" />
      <span>Polls don't count toward the weekly market creation quests.</span>
    </Row>
  )
}
