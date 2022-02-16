export function OutcomeLabel(props: {
  outcome: 'YES' | 'NO' | 'CANCEL' | 'MKT'
}) {
  const { outcome } = props

  if (outcome === 'YES') return <YesLabel />
  if (outcome === 'NO') return <NoLabel />
  if (outcome === 'MKT') return <ProbLabel />
  if (outcome === 'CANCEL') return <CancelLabel />
  return <AnswerNumberLabel number={outcome} />
}

export function YesLabel() {
  return <span className="text-primary">YES</span>
}

export function NoLabel() {
  return <span className="text-red-400">NO</span>
}

export function CancelLabel() {
  return <span className="text-yellow-400">N/A</span>
}

export function ProbLabel() {
  return <span className="text-blue-400">PROB</span>
}

export function AnswerNumberLabel(props: { number: string }) {
  return <span className="text-primary">#{props.number}</span>
}
