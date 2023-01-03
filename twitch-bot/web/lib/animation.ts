/* http://paulbourke.net/miscellaneous/interpolation */
export function cosine(a: number, b: number, factor: number) {
  const mu2 = (1 - Math.cos(factor * Math.PI)) / 2;
  return a * (1 - mu2) + b * mu2;
}

export function lerp(a: number, b: number, factor: number): number {
  return a + (b - a) * factor;
}

export function quartic(a: number, b: number, factor: number): number {
  return a + (b - a) * (1 - Math.pow(1 - factor, 4));
}

export class AnimationTimer {
  private startTime_ms: number;
  constructor() {
    this.reset();
  }
  public getTime_s(cap = Number.POSITIVE_INFINITY) {
    return Math.min((Date.now() - this.startTime_ms) * 0.001, cap);
  }
  public reset() {
    this.startTime_ms = Date.now();
  }
}
