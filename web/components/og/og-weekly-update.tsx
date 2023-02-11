import { WeeklyPortfolioUpdateOGCardProps } from 'common/weekly-portfolio-update'
import { ogPoint, ProfitLossGraph } from 'web/components/og/graph'
// Notes for working with this:
// - Some css elements are missing or broken (e.g. 'gap' and 'text-ellipsis' and 'line-clamp')
// - I also can't make things overflow hidden in only one direction
// - Every element should have `flex` set
export function OgWeeklyUpdate(props: WeeklyPortfolioUpdateOGCardProps) {
  const {
    creatorName,
    creatorAvatarUrl,
    creatorUsername,
    weeklyProfit,
    points,
  } = props
  const data = JSON.parse(points) as ogPoint[]
  const date =
    new Date(data[0].x).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) +
    ' - ' +
    new Date(data[data.length - 1].x).toLocaleDateString('en-US', {
      day: 'numeric',
    })

  return (
    <div className="flex h-full w-full flex-col bg-white px-24">
      {/* <!-- Profile image --> */}
      <div className="absolute left-24 top-8 flex flex-row ">
        <img
          className="mr-6 flex h-24 w-24 items-center justify-center rounded-full bg-white"
          src={creatorAvatarUrl}
          alt=""
        />
        <div className="mt-3 flex flex-col">
          <div className="flex text-3xl text-gray-900">{creatorName}</div>
          <div className="flex text-3xl text-gray-500">@{creatorUsername}</div>
        </div>
      </div>

      {/* <!-- Manifold logo --> */}
      <div className="absolute right-24 top-8 flex">
        <img
          className="mr-3 h-12 w-12"
          src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.svg"
          width="40"
          height="40"
        />
        <div
          className="mt-3 flex text-3xl lowercase"
          style={{ fontFamily: 'Major Mono Display' }}
        >
          Manifold Markets
        </div>
      </div>

      <div className={'relative mt-[6rem] flex w-full flex-row justify-center'}>
        <ProfitLossGraph data={data} height={500} aspectRatio={2.4} />
      </div>

      {/* We render the profit last so it appears over the graph*/}
      <div className="absolute top-44 left-20 flex w-full flex-row justify-between">
        {ProfitDiv(parseInt(weeklyProfit), date)}
      </div>
    </div>
  )
}

function ProfitDiv(profit: number, date: string) {
  const color = profit > 0 ? 'text-teal-500' : 'text-red-600'
  return (
    <div className={'flex flex-col rounded-md bg-white p-2 ' + color}>
      <div className="flex flex-row text-8xl">M${profit}</div>
      <div className=" flex w-full flex-row justify-center text-4xl">
        {date} profit
      </div>
    </div>
  )
}
