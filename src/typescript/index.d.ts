export type LogitechG29GeneralEvent = 'all' | 'changes' | 'data'

export type LogitechG29Options = {
  autocenter: boolean
  debug: boolean
  range: number
}

export type LogitechG29PedalsEvent =
  | 'pedals-brake'
  | 'pedals-clutch'
  | 'pedals-gas'

export type LogitechG29ShifterEvent = 'shifter-gear'

export type LogitechG29WheelEvent =
  | 'wheel-button_circle'
  | 'wheel-button_l2'
  | 'wheel-button_l3'
  | 'wheel-button_minus'
  | 'wheel-button_option'
  | 'wheel-button_playstation'
  | 'wheel-button_plus'
  | 'wheel-button_r2'
  | 'wheel-button_r3'
  | 'wheel-button_share'
  | 'wheel-button_spinner'
  | 'wheel-button_square'
  | 'wheel-button_triangle'
  | 'wheel-button_x'
  | 'wheel-dpad'
  | 'wheel-shift_left'
  | 'wheel-shift_right'
  | 'wheel-spinner'
  | 'wheel-turn'
