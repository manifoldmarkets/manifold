import { Row } from './layout/row'

export function ProbabilitySelector(props: {
  probabilityInt: number
  setProbabilityInt: (p: number) => void
  isSubmitting?: boolean
  minProb?: number
  maxProb?: number
}) {
  const { probabilityInt, setProbabilityInt, isSubmitting, minProb, maxProb } =
    props

  return (
    <Row className="items-center gap-2">
      <label className="input-group input-group-lg w-fit text-lg">
        <input
          type="number"
          value={probabilityInt}
          className="input input-bordered input-md text-lg"
          disabled={isSubmitting}
          min={minProb ?? 1}
          max={maxProb ?? 99}
          onChange={(e) =>
            setProbabilityInt(parseInt(e.target.value.substring(0, 2)))
          }
          onBlur={() =>
            setProbabilityInt(
              maxProb && probabilityInt > maxProb
                ? maxProb
                : minProb && probabilityInt < minProb
                ? minProb
                : probabilityInt
            )
          }
        />
        <span>%</span>
      </label>
      <input
        type="range"
        className="range range-primary"
        min={minProb ?? 1}
        max={maxProb ?? 99}
        value={probabilityInt}
        onChange={(e) => setProbabilityInt(parseInt(e.target.value))}
      />
    </Row>
  )
}
