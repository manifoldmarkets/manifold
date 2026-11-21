import clsx from 'clsx'

import { formatDiscountPercent } from 'common/holiday-sale'
import { useActiveHolidaySale } from 'web/hooks/use-holiday-sale'

// Tells card buyers about the Black Friday / Cyber Monday price. The API puts
// the discount on the Stripe checkout itself, so there's nothing to type.
export function HolidaySaleNote(props: { className?: string }) {
  const sale = useActiveHolidaySale()
  if (!sale) return null
  return (
    <div
      className={clsx(
        'rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200',
        props.className
      )}
    >
      <div className="font-semibold">
        {sale.name}: {formatDiscountPercent(sale.manaDiscount)} off every mana
        pack
      </div>
      <p className="mt-1">
        Pay by card and the discount is applied at checkout. You get the full
        amount of mana.
      </p>
    </div>
  )
}
