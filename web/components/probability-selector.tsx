import { Row } from './layout/row'

export function ProbabilitySelector(props: {
  probabilityInt: number
  setProbabilityInt: (p: number) => void
  isSubmitting?: boolean
}) {
  const { probabilityInt, setProbabilityInt, isSubmitting } = props

  return (
    <Row className="items-center gap-2">
      <label className="input-group input-group-lg w-fit text-lg">
        <input
          type="number"
          value={probabilityInt}
          className="input input-bordered input-md text-lg"
          disabled={isSubmitting}
          min={1}
          max={99}
          onChange={(e) =>
            setProbabilityInt(parseInt(e.target.value.substring(0, 2)))
          }
        />
        <span>%</span>
      </label>
      <input
        type="range"
        className="range range-primary"
        min={1}
        max={99}
        value={probabilityInt}
        onChange={(e) => setProbabilityInt(parseInt(e.target.value))}
      />
    </Row>
  )
}
