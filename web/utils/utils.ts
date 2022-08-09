const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
});
export function formatMoney(amount: number) {
    const newAmount = Math.round(amount) === 0 ? 0 : Math.floor(amount); // handle -0 case
    return "M$" + formatter.format(newAmount).replace("$", "");
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const CONTRACT_ANTE = 100;
export const DPM_CREATOR_FEE = 0.04;

export type Resolution = "YES" | "NO" | "CANCEL" | "MKT";