import { Card } from 'web/components/widgets/card'
import { AILabData } from 'web/lib/ai/types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import Link from 'next/link'
import { contractPath } from 'common/contract'
import { formatPercent } from 'common/util/format'
import clsx from 'clsx'

export function ChatbotArenaPanel({ topLabs, contract }: { topLabs: AILabData[], contract: any }) {
  // Only show top 3 labs
  const top3Labs = topLabs.slice(0, 3);
  
  return (
    <Card className="p-4">
      <Col className="gap-4">
        <Row className="items-center justify-between">
          <Row className="items-center gap-2">
            <div className="text-xl font-medium">Which company will have the top AI model by end of 2024?</div>
            <InfoTooltip text="Prediction market odds on which company will have the highest-rated model on Chatbot Arena by December 31, 2024" />
          </Row>
          {contract && (
            <Link 
              href={contractPath(contract)} 
              className="text-sm text-indigo-500 hover:underline"
            >
              View market →
            </Link>
          )}
        </Row>
        
        <Row className="justify-between gap-4">
          {top3Labs.map((lab, index) => {
            // Color based on probability rather than rank
            const getColorIntensity = (prob: number) => {
              if (prob >= 0.4) return "600";
              if (prob >= 0.3) return "500";
              if (prob >= 0.2) return "400";
              if (prob >= 0.1) return "300";
              return "200";
            };
            
            const colorIntensity = getColorIntensity(lab.probability);
            
            return (
              <Col 
                key={lab.name} 
                className="flex-1 rounded-lg border p-4 relative"
              >
                <div className="absolute top-2 right-2 text-2xl font-bold">
                  #{index + 1}
                </div>
                
                {/* Logo placeholder */}
                <div className={clsx(
                  "w-20 h-20 rounded-full mb-3 flex items-center justify-center text-white font-bold text-2xl",
                  `bg-indigo-${colorIntensity}`
                )}>
                  {lab.name.substring(0, 1)}
                </div>
                
                <div className="text-lg font-bold">{lab.name}</div>
                
                {/* Probability as the main focus */}
                <div className="text-3xl font-bold mt-2 mb-1">
                  {formatPercent(lab.probability)}
                </div>
                
                <div className="mt-3 text-sm text-gray-500">
                  Current model: {lab.model}
                </div>
              </Col>
            );
          })}
        </Row>
        
        <div className="text-sm text-ink-500 text-center">
          Based on prediction market odds as of {new Date().toLocaleDateString()}
        </div>
      </Col>
    </Card>
  )
}
