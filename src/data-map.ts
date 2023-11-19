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

import { RigState as LogitechG29State } from './models/rig-state'

/**
 * Figure out what has changed since the last event and call relevant functions to translate those changes to a memory object.
 * @param dataDiffPositions An array.
 * @param data Buffer data from a node-hid event.
 * @param state Modified memory object.
 */
export function updateState(
  data: number[],
  lastData: number[],
  state: LogitechG29State
) {
  for (let index = 0; index < data.length; index++) {
    if (data[index] !== lastData[index]) {
      switch (index) {
        case 0:
          const value0 = data[0]

          state.wheel.dpad = wheelDpad(value0)
          state.wheel.buttonX = value0 & 16 ? 1 : 0
          state.wheel.buttonSquare = value0 & 32 ? 1 : 0
          state.wheel.buttonCircle = value0 & 64 ? 1 : 0
          state.wheel.buttonTriangle = value0 & 128 ? 1 : 0

          break
        case 1:
          const value1 = data[1]

          state.wheel.shiftRight = value1 & 1
          state.wheel.shiftLeft = value1 & 2 ? 1 : 0
          state.wheel.buttonR2 = value1 & 4 ? 1 : 0
          state.wheel.buttonL2 = value1 & 8 ? 1 : 0
          state.wheel.buttonShare = value1 & 16 ? 1 : 0
          state.wheel.buttonOption = value1 & 32 ? 1 : 0
          state.wheel.buttonR3 = value1 & 64 ? 1 : 0
          state.wheel.buttonL3 = value1 & 128 ? 1 : 0

          break
        case 2:
          const value2 = data[2]

          state.shifter.gear = shifterGear(value2)
          state.wheel.buttonPlus = value2 & 128 ? 1 : 0

          break
        case 3:
          const value3 = data[3]

          state.wheel.buttonMinus = value3 & 1

          if (value3 & 2) {
            state.wheel.spinner = 1
          } else if (value3 & 4) {
            state.wheel.spinner = -1
          } else {
            state.wheel.spinner = 0
          }

          state.wheel.buttonSpinner = value3 & 8 ? 1 : 0
          state.wheel.buttonPlaystation = value3 & 16 ? 1 : 0

          break
        case 4:
        case 5:
          state.wheel.turn = wheelTurn(data)

          break
        case 6:
          state.pedals.gas = pedalToPercent(data[6])

          break
        case 7:
          state.pedals.brake = pedalToPercent(data[7])

          break
        case 8:
          state.pedals.clutch = pedalToPercent(data[8])

          break
        case 11:
          state.shifter.gear = shifterGear(data[2]) // for reverse

          break
      }
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
      // neutral
      return 0
    case 7:
      // top left
      return 8
    case 6:
      // left
      return 7
    case 5:
      // bottom left
      return 6
    case 4:
      // bottom
      return 5
    case 3:
      // bottom right
      return 4
    case 2:
      // right
      return 3
    case 1:
      // top right
      return 2
    case 0:
      // top
      return 1
    default:
      return 0
  }
}

function wheelTurn(data: number[]) {
  const wheelFine = (data[4] / 255) * (100 / 256) // returns a number between 0 and 0.390625
  const wheelCourse = (data[5] / 255) * (100 - 100 / 256) // returns a number between 0 and 99.609375

  return Math.min(Math.max(round(wheelCourse + wheelFine, 2), 0), 100)
}

function pedalToPercent(num: number) {
  return round(Math.abs(num - 255) / 255, 2)
}

function shifterGear(value: number) {
  switch (reduceNumberFromTo(value, 64)) {
    case 0:
      // neutral
      return 0
    case 1:
      // first gear
      return 1
    case 2:
      // second gear
      return 2
    case 4:
      // third gear
      return 3
    case 8:
      // fourth gear
      return 4
    case 16:
      // fifth gear
      return 5
    case 32:
      // sixth gear
      return 6
    case 64:
      // reverse gear
      return -1
    default:
      return 0
  }
}
