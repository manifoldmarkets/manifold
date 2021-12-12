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

import { useBets } from '../hooks/use-bets'
import { Contract } from '../lib/firebase/contracts'

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

export function ContractProbGraph(props: { contract: Contract }) {
  const { contract } = props
  const { id, seedAmounts } = contract

  let bets = useBets(id)
  if (bets === 'loading') bets = []

  const seedProb =
    seedAmounts.YES ** 2 / (seedAmounts.YES ** 2 + seedAmounts.NO ** 2)

  const probs = [seedProb, ...bets.map((bet) => bet.probAfter)]

  const chartData = {
    labels: Array.from({ length: probs.length }, (_, i) => i + 1),
    datasets: [
      {
        label: 'Implied probability',
        data: probs,
        borderColor: 'rgb(75, 192, 192)',
      },
    ],
  }

  return <Line data={chartData} height={150} />
}
