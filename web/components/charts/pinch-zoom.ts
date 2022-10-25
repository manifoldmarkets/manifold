export interface PointerTouch {
  pointerId: number
  clientX: number
  clientY: number
}

export type PinchZoomEvent = {
  sourceEvent: React.PointerEvent
  centerX: number
  centerY: number
  deltaX: number
  deltaY: number
}
export type PinchZoomHandler = (ev: PinchZoomEvent) => void

export class PinchDetector {
  evCache: PointerTouch[]
  currPinch: { totalDx: number; totalDy: number }
  onPinch: PinchZoomHandler

  constructor(onPinch: PinchZoomHandler) {
    this.evCache = []
    this.onPinch = onPinch
    this.currPinch = { totalDx: 0, totalDy: 0 }
    this.onPointerDown({ pointerId: 100, clientX: 0, clientY: 0 })
  }

  onPointerDown(ev: PointerTouch) {
    this.evCache.push(ev)
  }

  onPointerMove(ev: React.PointerEvent) {
    for (let i = 0; i < this.evCache.length; i++) {
      if (ev.pointerId == this.evCache[i].pointerId) {
        this.evCache[i] = ev
        break
      }
    }

    if (this.evCache.length == 2) {
      const centerX = (this.evCache[1].clientX + this.evCache[0].clientX) / 2
      const centerY = (this.evCache[1].clientY + this.evCache[0].clientY) / 2
      const currDx = this.evCache[1].clientX - this.evCache[0].clientX
      const currDy = this.evCache[1].clientY - this.evCache[0].clientY
      const deltaX = currDx - this.currPinch.totalDx
      const deltaY = currDy - this.currPinch.totalDy
      const pinchEvent = {
        sourceEvent: ev,
        centerX,
        centerY,
        deltaX,
        deltaY,
      }
      this.onPinch(pinchEvent)
      this.currPinch.totalDx = currDx
      this.currPinch.totalDy = currDy
    }
  }

  onPointerUp(ev: PointerTouch) {
    // Remove this pointer from the cache and reset the target's
    // background and border
    this.removeEvent(ev)
    // If the number of pointers down is less than two then reset diff tracker
    if (this.evCache.length < 2) {
      this.currPinch.totalDx = 0
      this.currPinch.totalDy = 0
    }
  }

  removeEvent(ev: PointerTouch) {
    for (let i = 0; i < this.evCache.length; i++) {
      if (this.evCache[i].pointerId == ev.pointerId) {
        this.evCache.splice(i, 1)
        break
      }
    }
  }
}
