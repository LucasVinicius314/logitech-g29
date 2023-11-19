import { PedalState } from './pedal-state'
import { ShifterState } from './shifter-state'
import { WheelState } from './wheel-state'

export class RigState {
  pedals: PedalState = new PedalState()
  shifter: ShifterState = new ShifterState()
  wheel: WheelState = new WheelState()
}
