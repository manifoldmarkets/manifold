import { Card } from 'web/components/widgets/card'
import { BenchmarkData } from 'web/lib/ai/types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import Link from 'next/link'
import { contractPath } from 'common/contract'
import { ChartBarIcon, ArrowSmUpIcon, ArrowSmDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'

export function BenchmarkCard({ benchmark }: { benchmark: BenchmarkData }) {
  const { name, description, contract, currentValue, previousValue, changeValue, link } = benchmark
  const user = useUser()

  const isPositiveChange = (changeValue ?? 0) > 0
  
  return (
    <Card className="w-full flex-1 p-4">
      <Col className="gap-2">
        <Row className="justify-between">
          <Row className="items-center gap-1">
            <ChartBarIcon className="h-5 w-5 text-indigo-600" />
            {contract ? (
              <Link 
                href={contractPath(contract)} 
                className="text-lg font-medium hover:text-primary-600 hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="text-lg font-medium">{name}</span>
            )}
            <InfoTooltip text={description} />
          </Row>
          {link && (
            <Link 
              href={link} 
              target="_blank" 
              className="text-xs text-indigo-500 hover:underline"
            >
              View source →
            </Link>
          )}
        </Row>
        
        <Row className="items-end justify-between">
          <div className="text-2xl font-bold">{currentValue}</div>
          {changeValue !== undefined && (
            <Row className={clsx(
              "items-center text-sm",
              isPositiveChange ? "text-teal-600" : "text-scarlet-600"
            )}>
              {isPositiveChange ? (
                <ArrowSmUpIcon className="h-4 w-4" />
              ) : (
                <ArrowSmDownIcon className="h-4 w-4" />
              )}
              <span className="font-medium">
                {isPositiveChange ? "+" : ""}{changeValue}%
              </span>
            </Row>
          )}
        </Row>
        
        {previousValue && (
          <div className="text-ink-500 text-xs">
            Previous: {previousValue}
          </div>
        )}
      </Col>
    </Card>
  )
}
