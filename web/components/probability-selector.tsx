import { Input } from './widgets/input'

export function ProbabilitySelector(props: {
  probabilityInt: number
  setProbabilityInt: (p: number) => void
  isSubmitting?: boolean
}) {
  const { probabilityInt, setProbabilityInt, isSubmitting } = props

  return (
    <label className="flex items-center text-lg">
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
  )
}
