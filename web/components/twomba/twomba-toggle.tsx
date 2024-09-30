import clsx from 'clsx'
import { ManaFlatCoin } from 'web/public/custom-components/manaFlatCoin'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'
import { useSweepstakes } from 'web/components/sweestakes-context'
import { SweepiesFlatCoinX } from 'web/public/custom-components/sweepiesFlatCoinX'
import { Tooltip } from 'web/components/widgets/tooltip'

export function TwombaToggle({
  sweepsEnabled = false,
  isPlay: isPlayProp,
  onClick,
  isSmall = false,
}: {
  sweepsEnabled?: boolean
  isPlay?: boolean
  onClick?: () => void
  isSmall?: boolean
}) {
  const { isPlay: contextIsPlay, setIsPlay: contextSetIsPlay } =
    useSweepstakes()
  const isPlay = isPlayProp !== undefined ? isPlayProp : contextIsPlay

  const handleClick = () => {
    if (sweepsEnabled) {
      if (onClick) {
        onClick()
      } else {
        contextSetIsPlay(!isPlay)
      }
    }
  }

  const SweepiesCoin = sweepsEnabled ? SweepiesFlatCoin : SweepiesFlatCoinX

  return (
    <Tooltip
      text={
        sweepsEnabled
          ? null
          : 'This question does not have sweepstakes enabled.'
      }
    >
      <button
        className={clsx(
          'bg-ink-200 dark:bg-canvas-50 relative flex h-fit w-fit shrink-0 flex-row items-center rounded-full  p-0.5 transition-colors',
          isSmall
            ? 'gap-0.5  border-[1px]  text-lg'
            : 'gap-1 border-[1.5px]   text-2xl',
          isPlay
            ? 'border-violet-600 dark:border-violet-400'
            : 'border-amber-500 dark:border-amber-200',
          sweepsEnabled
            ? ''
            : '!dark:border-gray-400 cursor-not-allowed !border-gray-400 opacity-60' // Greys out the button when disabled
        )}
        onClick={handleClick}
      >
        <div
          className={clsx(
            'dark:bg-ink-300 bg-canvas-0 absolute rounded-full drop-shadow transition-all ',
            isPlay
              ? 'left-0'
              : isSmall
              ? 'left-[calc(100%-22px)]'
              : 'left-[calc(100%-28px)]',
            isSmall ? ' h-[22px] w-[22px]' : ' h-[28px] w-[28px] '
          )}
        />
        <ManaFlatCoin
          className={clsx(
            'z-10 transition-opacity',
            isPlay ? 'opacity-100' : 'opacity-20',
            isSmall ? 'h-5' : 'h-8'
            // sweepsEnabled ? '' : 'grayscale filter'
          )}
        />
        <SweepiesCoin
          className={clsx(
            'z-10 transition-opacity',
            isSmall ? 'h-4' : 'h-8',
            !isPlay ? 'opacity-100' : 'opacity-20',
            sweepsEnabled ? '' : 'grayscale filter'
          )}
        />
      </button>
    </Tooltip>
  )
}
