import { Input } from './input'
import { Row } from './layout/row'

export function ProbabilitySelector(props: {
  probabilityInt: number
  setProbabilityInt: (p: number) => void
  isSubmitting?: boolean
}) {
  const { probabilityInt, setProbabilityInt, isSubmitting } = props

  return (
    <Row className="items-center  gap-2">
      <label className="input-group input-group-lg text-lg">
        <Input
          type="number"
          value={probabilityInt}
          className="input-md w-28 !text-lg"
          disabled={isSubmitting}
          min={1}
          max={99}
          onChange={(e) =>
            setProbabilityInt(parseInt(e.target.value.substring(0, 2)))
          }
        />
        <span>%</span>
      </label>
    </Row>
  )
}
