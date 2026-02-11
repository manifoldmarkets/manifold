import { Avatar } from 'web/components/widgets/avatar'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'

type CapDesign = {
  name: string
  description: string
  render: (team: 'red' | 'green') => JSX.Element
}

// Variation 1: Classic Rally Cap - Clean front view, rounded brim (ORIGINAL)
const ClassicRallyCap = ({ team }: { team: 'red' | 'green' }) => {
  const colors =
    team === 'red'
      ? { main: '#DC2626', light: '#EF4444', dark: '#991B1B', accent: '#FEE2E2' }
      : { main: '#16A34A', light: '#22C55E', dark: '#14532D', accent: '#DCFCE7' }

  return (
    <svg viewBox="0 0 32 24" className="h-full w-full">
      {/* Tall structured crown */}
      <path d="M4 14 L4 6 Q16 2 28 6 L28 14 Z" fill={colors.light} />
      {/* Front panel - darker, prominent */}
      <path d="M8 14 L8 7 Q16 4 24 7 L24 14 Z" fill={colors.main} />
      {/* Subtle center seam */}
      <path d="M16 4 L16 13" stroke={colors.dark} strokeWidth="0.4" opacity="0.5" />
      {/* Rounded brim */}
      <path d="M2 14 Q16 13.5 30 14 Q28 18 16 19 Q4 18 2 14 Z" fill={colors.dark} />
      {/* Brim edge highlight */}
      <path d="M4 14.5 Q16 14 28 14.5" stroke={colors.accent} strokeWidth="0.5" opacity="0.5" fill="none" />
      {/* Button */}
      <circle cx="16" cy="4" r="1.5" fill={colors.dark} />
    </svg>
  )
}

// Variation 2: Tilted Rally Cap - Slight 3/4 angle view
const TiltedRallyCap = ({ team }: { team: 'red' | 'green' }) => {
  const colors =
    team === 'red'
      ? { main: '#DC2626', light: '#EF4444', dark: '#B91C1C', darker: '#7F1D1D', highlight: '#FCA5A5' }
      : { main: '#16A34A', light: '#22C55E', dark: '#15803D', darker: '#14532D', highlight: '#86EFAC' }

  return (
    <svg viewBox="0 0 32 24" className="h-full w-full">
      {/* Tall structured crown - slightly asymmetric for angle */}
      <path d="M5 14 L6 6 Q17 2 29 7 L28 14 Z" fill={colors.light} />
      {/* Front panel - offset for angle */}
      <path d="M9 14 L10 7 Q17 4 25 8 L24 14 Z" fill={colors.main} />
      {/* Side panel visible */}
      <path d="M5 14 L6 7 L10 7 L9 14 Z" fill={colors.dark} opacity="0.3" />
      {/* Subtle off-center seam */}
      <path d="M17 4.5 L17 13" stroke={colors.darker} strokeWidth="0.3" opacity="0.4" />
      {/* Rounded brim with angle */}
      <path d="M3 14 Q17 13 31 15 Q28 19 16 19 Q4 18 3 14 Z" fill={colors.dark} />
      {/* Brim highlight */}
      <path d="M5 14.5 Q17 14 29 15" stroke={colors.highlight} strokeWidth="0.4" opacity="0.4" fill="none" />
      {/* Button */}
      <circle cx="17" cy="4" r="1.4" fill={colors.darker} />
    </svg>
  )
}

const capDesigns: CapDesign[] = [
  {
    name: 'Classic Rally',
    description: 'Clean front view, rounded brim, subtle center seam',
    render: (team) => <ClassicRallyCap team={team} />,
  },
  {
    name: 'Tilted Rally',
    description: 'Slight 3/4 angle view with visible side panel',
    render: (team) => <TiltedRallyCap team={team} />,
  },
]

function CapPreviewTile({
  design,
  team,
  user,
}: {
  design: CapDesign
  team: 'red' | 'green'
  user: ReturnType<typeof useUser>
}) {
  const teamLabel = team === 'red' ? 'Team Red' : 'Team Green'
  const bgColor = team === 'red' ? 'bg-red-50 dark:bg-red-950/20' : 'bg-green-50 dark:bg-green-950/20'
  const borderColor = team === 'red' ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800'

  return (
    <div className={`rounded-lg border p-4 ${bgColor} ${borderColor}`}>
      <div className="mb-2 text-center">
        <div className="text-sm font-semibold">{design.name}</div>
        <div className="text-ink-500 text-xs">{teamLabel}</div>
      </div>
      <div className="flex justify-center">
        <div className="relative">
          <Avatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="lg"
            noLink
          />
          {/* Cap overlay */}
          <div
            className="absolute"
            style={{
              left: '50%',
              transform: 'translateX(-50%) rotate(-5deg)',
              top: -10,
              width: 30,
              height: 30,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            }}
          >
            {design.render(team)}
          </div>
        </div>
      </div>
      <div className="text-ink-600 mt-2 text-center text-xs">{design.description}</div>
    </div>
  )
}

export default function ShopPreviewPage() {
  const user = useUser()

  return (
    <Page trackPageView="shop preview">
      <Col className="mx-auto max-w-4xl gap-8 p-4">
        <Title>Shop Preview - Rally Cap Variations</Title>

        <div className="text-ink-600 text-sm">
          Comparing cap designs. <strong>#1 Classic Rally</strong> and <strong>#2 Tilted Rally</strong> are the best.
        </div>

        {capDesigns.map((design, index) => (
          <div key={design.name} className="space-y-2">
            <h3 className="text-lg font-semibold">
              {index + 1}. {design.name}
            </h3>
            <Row className="flex-wrap gap-4">
              <CapPreviewTile design={design} team="red" user={user} />
              <CapPreviewTile design={design} team="green" user={user} />
            </Row>
          </div>
        ))}

        {/* Side by side comparison at different sizes */}
        <div className="mt-8">
          <h3 className="mb-4 text-lg font-semibold">Size Comparison (Classic Rally Cap)</h3>
          <Row className="flex-wrap items-end gap-6">
            {(['2xs', 'xs', 'sm', 'md', 'lg'] as const).map((size) => {
              const capSize =
                size === '2xs' ? 12 : size === 'xs' ? 14 : size === 'sm' ? 18 : size === 'md' ? 24 : 30
              const topOffset =
                size === '2xs' ? -4 : size === 'xs' ? -5 : size === 'sm' ? -7 : size === 'md' ? -9 : -10

              return (
                <div key={size} className="text-center">
                  <div className="relative inline-block">
                    <Avatar
                      username={user?.username}
                      avatarUrl={user?.avatarUrl}
                      size={size}
                      noLink
                    />
                    <div
                      className="absolute"
                      style={{
                        left: '50%',
                        transform: 'translateX(-50%) rotate(-5deg)',
                        top: topOffset,
                        width: capSize,
                        height: capSize,
                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
                      }}
                    >
                      <ClassicRallyCap team="red" />
                    </div>
                  </div>
                  <div className="text-ink-500 mt-1 text-xs">{size}</div>
                </div>
              )
            })}
          </Row>
        </div>
      </Col>
    </Page>
  )
}
