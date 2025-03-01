const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});
export function formatMoney(amount: number) {
  const newAmount = Math.round(amount) === 0 ? 0 : Math.floor(amount); // handle -0 case
  return 'M$' + formatter.format(newAmount).replace('$', '');
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const CONTRACT_ANTE = 50;
export const DPM_CREATOR_FEE = 0.04;

export type Resolution = 'YES' | 'NO' | 'CANCEL' | 'MKT';

let getTextWidthCanvas: HTMLCanvasElement;
export function getTextWidth(text: string, font: string) {
  const canvas = getTextWidthCanvas || (getTextWidthCanvas = document.createElement('canvas')); // If given, use cached canvas for better performance else create new canvas
  const context = canvas.getContext('2d');
  context.font = font;
  const metrics = context.measureText(text);
  return metrics.width;
}

export function getCssStyle(element: HTMLElement, prop: string) {
  return window.getComputedStyle(element, null).getPropertyValue(prop);
}

export function getCanvasFont(el = document.body) {
  const fontWeight = getCssStyle(el, 'font-weight') || 'normal';
  const fontSize = getCssStyle(el, 'font-size') || '16px';
  const fontFamily = getCssStyle(el, 'font-family') || 'Times New Roman';

  return `${fontWeight} ${fontSize} ${fontFamily}`;
}

export function randomInt(maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive + 1));
}
