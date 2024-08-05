import clsx from 'clsx'
import { ManaFlatCoin } from 'web/public/custom-components/manaFlatCoin'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'

export type TWOMBA_MODE_TYPE = 'sweepies' | 'mana'

export function TwombaToggle(props: {
  mode: TWOMBA_MODE_TYPE
  onClick: () => void
}) {
  const { mode, onClick } = props
  return (
    <button
      className="bg-ink-200 dark:bg-canvas-50 relative flex h-fit w-fit shrink-0 flex-row items-center gap-1 rounded-full p-0.5 text-2xl"
      onClick={onClick}
    >
      {/* Add a moving circle behind the active coin */}
      <div
        className={clsx(
          'dark:bg-ink-300 bg-canvas-0 absolute h-[28px] w-[28px] rounded-full drop-shadow transition-all',
          mode === 'sweepies' ? 'left-0' : 'left-[calc(100%-28px)]'
        )}
      />
      <SweepiesFlatCoin
        className={clsx(
          'z-10 h-8 transition-opacity',
          mode === 'sweepies' ? 'opacity-100' : 'opacity-20'
        )}
      />
      <ManaFlatCoin
        className={clsx(
          'z-10 h-8 transition-opacity',
          mode === 'mana' ? 'opacity-100' : 'opacity-20'
        )}
      />
    </button>
  )
}
