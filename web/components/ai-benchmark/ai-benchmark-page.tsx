import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { HorizontalDashboard } from 'web/components/dashboard/horizontal-dashboard'
import Link from 'next/link'
import { AiBenchmarkPageProps } from 'web/lib/ai/types'
import { useSweepstakes } from 'web/components/sweepstakes-provider'
import { BenchmarkCard } from './benchmark-card'
import { BenchmarkCategoryCard } from './benchmark-category-card'
import { TimelineCard } from './timeline-card'
import { KeyBenchmarkPanel } from './key-benchmark-panel'
import { ChatbotArenaPanel } from './chatbot-arena-panel'
import { Title } from 'web/components/widgets/title'

export function AIBenchmarkPage(props: AiBenchmarkPageProps & { hideTitle?: boolean }) {
  const {
    frontierMathContract,
    humanityLastExamContract,
    sweBenchContract,
    benchmarks,
    aiTimeline,
    trendingDashboard,
    hideTitle,
    topLabs,
    chatbotArenaContract
  } = props

  const { prefersPlay } = useSweepstakes()

  const trending =
    trendingDashboard?.state == 'not found' ? null : (
      <Col className="-mb-6">
        <Row className="items-center gap-1 font-semibold sm:text-lg">
          <div className="relative">
            <div className="h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
            <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-indigo-500" />
          </div>
          <Link
            href="/ai-benchmark/trending"
            className="hover:text-primary-700 hover:underline"
          >
            Trending AI News
          </Link>
        </Row>
        <HorizontalDashboard
          initialDashboard={trendingDashboard.initialDashboard}
          previews={trendingDashboard.previews}
          initialContracts={trendingDashboard.initialContracts}
          slug={trendingDashboard.slug}
        />
      </Col>
    )

  return (
    <Col className="mb-8 gap-6 px-1 sm:gap-8 sm:px-2">
      <Col className={hideTitle ? 'hidden' : ''}>
        <Title className="mt-4 sm:mt-0">
          AI Benchmark Forecast
        </Title>
        <div className="text-canvas-500 text-md mt-2 flex font-normal">
          Live prediction market odds on major AI benchmarks
        </div>
      </Col>

      <ChatbotArenaPanel topLabs={topLabs} contract={chatbotArenaContract} />

      <KeyBenchmarkPanel
        frontierMathContract={frontierMathContract}
        humanityLastExamContract={humanityLastExamContract}
        sweBenchContract={sweBenchContract}
      />

      <TimelineCard aiTimeline={aiTimeline} />

      {trending}

      <Row className="flex-wrap gap-4">
        <BenchmarkCategoryCard
          title="Reasoning Benchmarks"
          description="Measuring AI performance on mathematical and logical tasks"
          benchmarks={benchmarks.reasoning}
        />
        <BenchmarkCategoryCard
          title="Coding Benchmarks"
          description="Tracking AI progress on software engineering tasks"
          benchmarks={benchmarks.coding}
        />
      </Row>

      <Row className="flex-wrap gap-4">
        <BenchmarkCategoryCard
          title="Safety Benchmarks"
          description="Assessing AI alignment and safety metrics"
          benchmarks={benchmarks.safety}
        />
        <BenchmarkCategoryCard
          title="Capabilities Growth"
          description="Measuring AI hardware and parameter scaling"
          benchmarks={benchmarks.capabilities}
        />
      </Row>
    </Col>
  )
}
