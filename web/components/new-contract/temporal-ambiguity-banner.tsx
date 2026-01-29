import { XIcon } from '@heroicons/react/solid'
import { Row } from 'web/components/layout/row'
import { AmbiguousTemporalMatch } from 'web/lib/util/temporal-ambiguity'

export function TemporalAmbiguityBanner(props: {
  match: AmbiguousTemporalMatch
  onApplyReplacement: (original: string, replacement: string) => void
  onDismiss: () => void
}) {
  const { match, onApplyReplacement, onDismiss } = props

  return (
    <div className="relative rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
      <Row className="items-start gap-2">
        <div className="flex-1">
          <div className="mb-1 font-semibold">📅 Suggestion:</div>
          <p className="mb-2">
            "{match.original}" could mean different things. Did you mean:{' '}
            {match.alternatives.map((alt, i) => (
              <span key={alt.label}>
                {i > 0 && ' or '}
                <button
                  onClick={() => onApplyReplacement(match.original, alt.replacement)}
                  className="text-primary-600 hover:text-primary-700 font-medium underline hover:no-underline"
                >
                  {alt.label}
                </button>
              </span>
            ))}
            ?
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="hover:bg-ink-100 -mr-1 -mt-1 rounded p-1 transition-colors"
          aria-label="Dismiss"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </Row>
    </div>
  )
}
