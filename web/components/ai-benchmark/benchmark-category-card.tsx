import { BenchmarkData } from 'web/lib/ai/types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { BenchmarkCard } from './benchmark-card'
import { Title } from 'web/components/widgets/title'

export function BenchmarkCategoryCard({
  title,
  description,
  benchmarks
}: {
  title: string
  description: string
  benchmarks: BenchmarkData[]
}) {
  return (
    <Col className="flex-1 gap-3">
      <Row className="items-center justify-between">
        <div className="text-xl font-medium">{title}</div>
      </Row>
      <div className="text-canvas-500 -mt-2 text-sm">{description}</div>
      
      <Row className="flex-wrap gap-4">
        {benchmarks.map((benchmark) => (
          <Col key={benchmark.name} className="flex-1 min-w-[280px]">
            <BenchmarkCard benchmark={benchmark} />
          </Col>
        ))}
      </Row>
    </Col>
  )
}
