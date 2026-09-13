import { Card } from 'web/components/widgets/card'
import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { formatPercent } from 'common/util/format'
import Link from 'next/link'
import { contractPath } from 'common/contract'
import { useSweepstakes } from 'web/components/sweepstakes-provider'
import clsx from 'clsx'

export function KeyBenchmarkPanel(props: {
  frontierMathContract: Contract | null
  humanityLastExamContract: Contract | null
  sweBenchContract: Contract | null
}) {
  const { frontierMathContract, humanityLastExamContract, sweBenchContract } = props
  const { prefersPlay } = useSweepstakes()

  // Using placeholder values - these would come from the contracts in a real implementation
  const frontierMathScore = 78.4
  const humanityExamScore = 91.2
  const sweBenchScore = 67.3

  return (
    <Card className="p-4">
      <Row className="items-center justify-center gap-4 flex-wrap">
        <BenchmarkValue
          name="FrontierMath"
          value={`${frontierMathScore}%`}
          subtitle="Mathematical Reasoning"
          color="bg-indigo-100 text-indigo-800"
          contract={frontierMathContract}
        />
        
        <BenchmarkValue
          name="Humanity's Last Exam"
          value={`${humanityExamScore}%`}
          subtitle="General Knowledge"
          color="bg-teal-100 text-teal-800"
          contract={humanityLastExamContract}
        />
        
        <BenchmarkValue
          name="SWE-bench"
          value={`${sweBenchScore}%`}
          subtitle="Software Engineering"
          color="bg-amber-100 text-amber-800"
          contract={sweBenchContract}
        />
      </Row>
      
      <Row className="mt-4 justify-center text-sm text-ink-500">
        Current performance of top AI systems on key benchmarks
      </Row>
    </Card>
  )
}

function BenchmarkValue(props: {
  name: string
  value: string
  subtitle: string
  color: string
  contract: Contract | null
}) {
  const { name, value, subtitle, color, contract } = props
  
  return (
    <Col className="items-center gap-1 p-4">
      {contract ? (
        <Link 
          href={contractPath(contract)} 
          className="text-lg font-medium hover:text-primary-600 hover:underline text-center"
        >
          {name}
        </Link>
      ) : (
        <div className="text-lg font-medium text-center">{name}</div>
      )}
      <div className="text-sm text-ink-500">{subtitle}</div>
      <div className={clsx("text-3xl font-bold mt-2 px-3 py-1 rounded", color)}>
        {value}
      </div>
    </Col>
  )
}
