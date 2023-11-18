export type Options = {
  autocenter: boolean
  debug: boolean
  range: number
}

export type Memory = {
  pedals: PedalsMemory
  shifter: ShifterMemory
  wheel: WheelMemory
}

export type PedalsMemory = {
  brake: number
  clutch: number
  gas: number
}

export type ShifterMemory = {
  gear: number
}

export type WheelMemory = {
  button_circle: number
  button_l2: number
  button_l3: number
  button_minus: number
  button_option: number
  button_playstation: number
  button_plus: number
  button_r2: number
  button_r3: number
  button_share: number
  button_spinner: number
  button_square: number
  button_triangle: number
  button_x: number
  dpad: number
  shift_left: number
  shift_right: number
  spinner: number
  turn: number
}
