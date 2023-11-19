/*
  Details on each item of the read buffer provided by node-hid for the Logitech G29.
    Zero
      Wheel - Dpad
        0 = Top
        1 = Top Right
        2 = Right
        3 = Bottom Right
        4 = Bottom
        5 = Bottom Left
        6 = Left
        7 = Top Left
        8 = Dpad in Neutral Position

      Wheel - Symbol Buttons
         16 = X
         32 = Square
         64 = Circle
        128 = Triangle

    One
      Wheel - Shifter Pedals
        1 = Right Shifter
        2 = Left Shifter

      Wheel - Buttons
          4 = R2 Button
          8 = L2 Button
         16 = Share Button
         32 = Option Button
         64 = R3 Button
        128 = L3 Button

    Two
      Shifter - Gear Selector
         0 = Neutral
         1 = 1st Gear
         2 = 2nd Gear
         4 = 3rd Gear
         8 = 4th Gear
        16 = 5th Gear
        32 = 6th Gear
        64 = Reverse Gear

      Wheel
        128 = Plus Button

    Three
      Wheel - Spinner and Buttons
         1 = Minus Button
         2 = Spinner Right
         4 = Spinner Left
         8 = Spinner Button
        16 = PlayStation Button

    Four
      Wheel - Wheel Turn (fine movement)
        0-255

        0 is far left
        255 is far right

    Five
      Wheel - Wheel Turn
        0-255

        0 is far left
        255 is far right

    Six
      Pedals - Gas
        0-255

        0 is full gas
        255 is no pressure

    Seven
      Pedals - Brake
        0-255

        0 is full brake
        255 is no pressure

    Eight
      Pedals - Clutch
        0-255

        0 is full clutch
        255 is no pressure

    Nine
      Shifter
        X Coordinates (not used)

    Ten
      Shifter
        Y Coordinates (not used)

    Eleven
      Shifter
        Contains data on whether or not the gear selector is pressed down into the unit.
        If pressed down, the user is probably preparing to go into reverse. (not used)
*/

import { LogitechG29State } from './models/logitech-g29-state'

/**
 * Update what has changed since the last event.
 * @param data Buffer data from a node-hid event.
 * @param lastData Last saved buffer data from a node-hid event.
 * @param state The rig state.
 */
export function updateState(
  data: number[],
  lastData: number[],
  state: LogitechG29State
) {
  const changes: LogitechG29State = {}

  for (let index = 0; index < data.length; index++) {
    if (data[index] !== lastData[index]) {
      switch (index) {
        case 0:
          const value0 = data[0]

          compareState({
            state,
            changes,
            pairs: {
              'wheel-dpad': wheelDpad(value0),
              'wheel-button_x': value0 & 16 ? 1 : 0,
              'wheel-button_square': value0 & 32 ? 1 : 0,
              'wheel-button_circle': value0 & 64 ? 1 : 0,
              'wheel-button_triangle': value0 & 128 ? 1 : 0,
            },
          })

          break
        case 1:
          const value1 = data[1]

          compareState({
            state,
            changes,
            pairs: {
              'wheel-shift_right': value1 & 1,
              'wheel-shift_left': value1 & 2 ? 1 : 0,
              'wheel-button_r2': value1 & 4 ? 1 : 0,
              'wheel-button_l2': value1 & 8 ? 1 : 0,
              'wheel-button_share': value1 & 16 ? 1 : 0,
              'wheel-button_option': value1 & 32 ? 1 : 0,
              'wheel-button_r3': value1 & 64 ? 1 : 0,
              'wheel-button_l3': value1 & 128 ? 1 : 0,
            },
          })

          break
        case 2:
          const value2 = data[2]

          compareState({
            state,
            changes,
            pairs: {
              'shifter-gear': shifterGear(value2),
              'wheel-button_plus': value2 & 128 ? 1 : 0,
            },
          })

          break
        case 3:
          const value3 = data[3]

          let spinner = 0

          if (value3 & 2) {
            spinner = 1
          } else if (value3 & 4) {
            spinner = -1
          }

          compareState({
            state,
            changes,
            pairs: {
              'wheel-spinner': spinner,
              'wheel-button_minus': value3 & 1,
              'wheel-button_spinner': value3 & 8 ? 1 : 0,
              'wheel-button_playstation': value3 & 16 ? 1 : 0,
            },
          })

          break
        case 4:
        case 5:
          compareState({
            state,
            changes,
            pairs: {
              'wheel-turn': wheelTurn(data),
            },
          })

          break
        case 6:
          compareState({
            state,
            changes,
            pairs: {
              'pedals-gas': pedalToPercent(data[6]),
            },
          })

          break
        case 7:
          compareState({
            state,
            changes,
            pairs: {
              'pedals-brake': pedalToPercent(data[7]),
            },
          })

          break
        case 8:
          compareState({
            state,
            changes,
            pairs: {
              'pedals-clutch': pedalToPercent(data[8]),
            },
          })

          break
        case 11:
          // For reverse.
          compareState({
            state,
            changes,
            pairs: {
              'shifter-gear': shifterGear(data[2]),
            },
          })

          break
      }
    }
  }

  return changes
}

// TODO: fix, test
function compareState({
  changes,
  pairs,
  state,
}: {
  state: LogitechG29State
  changes: LogitechG29State
  pairs: LogitechG29State
}) {
  for (const key in pairs) {
    const value = pairs[key]

    if (state[key] !== value) {
      state[key] = value
      changes[key] = value
    }
  }
}

/**
 * Reduce a number by 128, 64, 32, etc... without going lower than a second number.
 * @param num
 * @param to
 */
function reduceNumberFromTo(num: number, to: number) {
  to *= 2

  let y = 128

  while (y > 1) {
    if (num < to) {
      break
    }

    if (num - y >= 0) {
      num -= y
    }

    y /= 2
  }

  return num
}

/**
 * Round a number to a certain amount of places.
 * @param num Number like 1.567.
 * @param exp Number of places to round to.
 */
function round(num: number, exp: number) {
  const factor = Math.pow(10, exp)

  return Math.round(num * factor) / factor
}

function wheelDpad(value: number) {
  switch (reduceNumberFromTo(value, 8)) {
    case 8:
      // Neutral.
      return 0
    case 7:
      // Top left.
      return 8
    case 6:
      // Left.
      return 7
    case 5:
      // Bottom left.
      return 6
    case 4:
      // Bottom.
      return 5
    case 3:
      // Bottom right.
      return 4
    case 2:
      // Right.
      return 3
    case 1:
      // Top right.
      return 2
    case 0:
      // Top.
      return 1
    default:
      return 0
  }
}

function wheelTurn(data: number[]) {
  const wheelFine = (data[4] / 255) * (100 / 256) // Returns a number between 0 and 0.390625.
  const wheelCourse = (data[5] / 255) * (100 - 100 / 256) // Returns a number between 0 and 99.609375.

  return Math.min(Math.max(round(wheelCourse + wheelFine, 2), 0), 100)
}

function pedalToPercent(num: number) {
  return round(Math.abs(num - 255) / 255, 2)
}

function shifterGear(value: number) {
  switch (reduceNumberFromTo(value, 64)) {
    case 0:
      // Neutral.
      return 0
    case 1:
      // First gear.
      return 1
    case 2:
      // Second gear.
      return 2
    case 4:
      // Third gear.
      return 3
    case 8:
      // Fourth gear.
      return 4
    case 16:
      // Fifth gear.
      return 5
    case 32:
      // Sixth gear.
      return 6
    case 64:
      // Reverse gear.
      return -1
    default:
      return 0
  }
}
