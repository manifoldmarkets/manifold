import React from 'react'
import { Line } from 'react-chartjs-2'
import {
  CategoryScale,
  Chart,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'

// Auto import doesn't work for some reason...
// So we manually register ChartJS components instead:
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)
const chartData = {
  labels: Array.from({ length: 0 }, (_, i) => i + 1),
  datasets: [
    {
      label: 'Implied probability',
      data: [],
      borderColor: 'rgb(75, 192, 192)',
    },
  ],
}

export const ContractOverview = (props: { contract: Contract }) => {
  const { contract } = props

  return (
    <Col className="max-w-3xl w-full">
      <div className="text-3xl font-medium p-2">{contract.question}</div>

      <Row className="flex-wrap text-sm text-gray-600">
        <div className="p-2 whitespace-nowrap">By {contract.creatorName}</div>
        <div className="py-2">•</div>
        <div className="p-2 whitespace-nowrap">Dec 9</div>
        <div className="py-2">•</div>
        <div className="p-2 whitespace-nowrap">200,000 volume</div>
      </Row>

      <Spacer h={4} />

      <Line data={chartData} height={150} />

      <Spacer h={12} />

      <div className="text-gray-600">{contract.description}</div>
    </Col>
  )
}
