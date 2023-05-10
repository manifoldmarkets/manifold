import { rewardsData } from 'common/leagues'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'

export function PrizesModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen} size={'md'} noAutoFocus>
      <div className="bg-canvas-0 text-ink-1000 rounded-lg p-3">
        <Col className={'mb-2 justify-center gap-2'}>
          <Title className={'!mb-1'}>Prizes</Title>
          <div className={'justify-center'}>
            {' '}
            Win mana at the end of the season based on your division and
            finishing rank.{' '}
          </div>
        </Col>
        <Col className="m-4 items-center justify-center">
          <table>
            {
              <table className="table-auto border-collapse border border-gray-300">
                <thead>
                  <tr>
                    <th className="border border-gray-300 px-4 py-2">Rank</th>
                    <th className="border border-gray-300 px-4 py-2">Bronze</th>
                    <th className="border border-gray-300 px-4 py-2">Silver</th>
                    <th className="border border-gray-300 px-4 py-2">Gold</th>
                    <th className="border border-gray-300 px-4 py-2">
                      Platinum
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }, (_, i) => (
                    <tr key={i}>
                      <td className="border border-gray-300 px-4 py-2 text-center font-black">
                        {i + 1}
                      </td>
                      {rewardsData.map((columnData, j) => (
                        <td
                          key={j}
                          className="border border-gray-300 px-4 py-2 text-center"
                        >
                          {columnData[i]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </table>
        </Col>
      </div>
    </Modal>
  )
}
