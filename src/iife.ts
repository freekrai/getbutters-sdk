import { identify, init, reset, track } from './index'

declare global {
  interface Window {
    butters: { init: typeof init; track: typeof track; identify: typeof identify; reset: typeof reset }
  }
}

window.butters = { init, track, identify, reset }
