type PointerStart = {
  pointerID: number
  x: number
  y: number
}

// A launcher drag emits a trailing click. Suppress that click only for the tile
// gesture and pointer that started inside the launcher; pointer movement
// elsewhere in the shell must never make launcher buttons inert.
export function createHomeTileClickGuard(travel = 10) {
  let pointer: PointerStart | undefined
  let dragged = false

  return {
    begin(next: PointerStart) {
      pointer = next
      dragged = false
    },
    move(next: { pointerID: number; x: number; y: number }) {
      if (!pointer || pointer.pointerID !== next.pointerID) return
      if (Math.hypot(next.x - pointer.x, next.y - pointer.y) <= travel) return
      dragged = true
    },
    end(pointerID: number) {
      if (!pointer || pointer.pointerID !== pointerID) return false
      pointer = undefined
      return true
    },
    clear() {
      pointer = undefined
      dragged = false
    },
    shouldSuppress() {
      return dragged
    },
  }
}
