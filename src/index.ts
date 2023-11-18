import * as events from 'events'
import * as hid from 'node-hid'
import * as os from 'os'

import { Memory, Options } from './typescript'

import { Chalk } from 'chalk'
import { dataMap } from './data-map'
import { getWheelDevicePath } from './utils'

const chalk = new Chalk()

let options: Options = {
  autocenter: true,
  debug: false,
  range: 900,
}

const platform = os.platform()

let lastLedValue = 0

let dataPrev = Array(12)
let device: hid.HID | undefined = undefined

let memoryPrev: Memory = {
  wheel: {
    turn: 50,
    shift_left: 0,
    shift_right: 0,
    dpad: 0,
    button_x: 0,
    button_square: 0,
    button_triangle: 0,
    button_circle: 0,
    button_l2: 0,
    button_r2: 0,
    button_l3: 0,
    button_r3: 0,
    button_plus: 0,
    button_minus: 0,
    spinner: 0,
    button_spinner: 0,
    button_share: 0,
    button_option: 0,
    button_playstation: 0,
  },
  shifter: {
    gear: 0,
  },
  pedals: {
    gas: 0,
    brake: 0,
    clutch: 0,
  },
}

let prependWrite = false

if (platform === 'win32') {
  prependWrite = true
}

export const eventEmitter = new events.EventEmitter()

/**
 * Connect to a Logitech G29 wheel.
 * @param odo Options object or callback function.
 * @param callback Callback function.
 */
export function connect({
  callback,
  options,
}: {
  options: Options
  callback: () => void
}) {
  userOptions(options)

  callback = typeof callback === 'function' ? callback : function () {}

  device = new hid.HID(getWheelDevicePath(options))

  device.read(function (err: any, data) {
    if (err) {
      if (options.debug) {
        console.log(chalk.red('connect -> Error reading from device.'), err)
      }

      callback(err)
    } else {
      forceOff()

      if (data.length === 12) {
        // wheel is already in high precision mode

        if (options.debug) {
          console.log(
            chalk.cyan('connect -> Wheel already in high precision mode.')
          )
        }

        listen(true, callback)
      } else {
        // wheel is not in high precision mode

        if (options.debug) {
          console.log(chalk.cyan('connect -> Initing'))
        }

        try {
          // G29 Wheel init from - https://github.com/torvalds/linux/blob/master/drivers/hid/hid-lg4ff.c
          relayOS([0xf8, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00])
          relayOS([0xf8, 0x09, 0x05, 0x01, 0x01, 0x00, 0x00])

          // wait for wheel to finish calibrating
          setTimeout(function () {
            listen(false, callback)
          }, 8000)
        } catch (err) {
          callback(err)
        }
      }
    }
  })

  // move the wheel to generate a read event
  forceConstant(1)
}

/**
 * Disconnect in preparation to connect again or to allow other software to use the wheel.
 */
export function disconnect(): void {
  device?.close()
}

function on(eventName: string, callback) {
  return eventEmitter.on(eventName, callback)
}

function once(str, func) {
  return eventEmitter.once(str, func)
}

/**
 * Relay low level commands directly to the hardware.
 * @param data Array of data to write. For example: [0x00, 0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01].
 */
export function relay(data: number[]): void {
  if (device !== undefined) {
    device.write(data)
  }
}

/**
 * Relay low level commands directly to the hardware after applying OS specific tweaks, if needed.
 * @param data Array of data to write. For example: [0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01]
 */
export function relayOS(data: number[]): void {
  if (prependWrite) {
    data.unshift(0x00)
  }

  if (device !== undefined) {
    device.write(data)
  }
}

/**
 * Set wheel range.
 */
function setRange(options: Options): void {
  if (options.range < 40) {
    options.range = 40
  }

  if (options.range > 900) {
    options.range = 900
  }

  const range1 = options.range & 0x00ff
  const range2 = (options.range & 0xff00) >> 8

  relayOS([0xf8, 0x81, range1, range2, 0x00, 0x00, 0x00])
}

/**
 * Set user options.
 * @param options Options object originally passed into the connect function.
 */
function userOptions(newOptions: Options): void {
  options = newOptions

  if (options.debug) {
    console.log(chalk.cyan('userOptions -> '), options)
  }
}

/**
 * Control the shift indicator LEDs.
 * @param value Array setting. Optional. See API documentation for more info.
 */
function leds(value: number) {
  if (lastLedValue === value) {
    return
  }

  if (value < 0 || value > 31) {
    // TODO: fix, exception
  }

  /*
    Setting should be a number from 0 to 31

    From outside in, mirrored on each side.

    0 = No LEDs
    1 = Green One
    2 = Green Two
    4 = Orange One
    8 = Orange Two
    16 = Red

    31 = All LEDs
  */

  relayOS([0xf8, 0x12, value, 0x00, 0x00, 0x00, 0x01])

  lastLedValue = value
}

/**
 * Set wheel autocentering based on existing options.
 */
function autoCenter() {
  const option = options.autocenter

  if (option) {
    // auto-center on
    relayOS([0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

    if (Array.isArray(option) && option.length === 2) {
      // custom auto-center

      // byte 3-4 is effect strength, 0x00 to 0x0f
      option[0] = Math.round(option[0] * 15)

      // byte 5 is the rate the effect strength rises as the wheel turns, 0x00 to 0xff
      option[1] = Math.round(option[1] * 255)

      relayOS([0xfe, 0x0d, option[0], option[0], option[1], 0x00, 0x00, 0x00])
    } else {
      // use default strength profile
      relayOS([0xfe, 0x0d, 0x07, 0x07, 0xff, 0x00, 0x00, 0x00])
    }
  } else {
    // auto-center off
    relayOS([0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  }
} // autoCenter

/**
 * Set or disable a constant force effect.
 * @param number Number between 0 and 1. Optional.
 */
export function forceConstant(number: number = 0.5) {
  if (number === 0.5) {
    forceOff(1)
    return
  }

  relayOS([
    0x11,
    0x00,
    Math.round(Math.abs(number - 1) * 255),
    0x00,
    0x00,
    0x00,
    0x00,
  ])
}

/**
 * Set or disable the amount of friction present when turning the wheel.
 * @param number Number between 0 and 1. Optional.
 */
export function forceFriction(number: number = 0): void {
  if (number === 0) {
    forceOff(2)
    return
  }

  // sending manual relay() commands to the hardware seems to reveal a 0x00 through 0x07 range
  // 0x07 is the strongest friction and then 0x08 is no friction
  // friction ramps up again from 0x08 to 0x0F
  number = Math.round(number * 7)

  // the first "number" is for left rotation, the second for right rotation
  relayOS([0x21, 0x02, number, 0x00, number, 0x00, 0x00])
}

/**
 * Turn off all force effects except auto-centering.
 * @param slot Number between 0 and 4. Optional.
 */
export function forceOff(slot: number = 0): void {
  // Great info at http://wiibrew.org/wiki/Logitech_USB_steering_wheel, especially about writing to more than one effect slot.
  if (slot === 0) {
    slot = 0xf3
  } else {
    slot = parseInt(`0x${slot.toFixed(0)}0`)
  }

  // turn off effects (except for auto-center)
  relayOS([slot, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
}

/**
 * @param ready True if the wheel is ready for commands. Optional.
 * @param callback Optional callback function.
 */
function listen(ready: boolean, callback) {
  if (!ready) {
    device?.close()
    device = new hid.HID(getWheelDevicePath(options))
  }

  setRange(options)
  autoCenter()

  device?.on('data', function (data: number[]) {
    // reset memory
    let memory = clone(memoryPrev)
    const memoryCache = clone(memoryPrev)

    const dataDiffPositions = []

    // find out if anything has changed since the last event
    const dataLength = data.length
    for (let i = 0; i < dataLength; i++) {
      if (data[i] !== dataPrev[i]) {
        dataDiffPositions.push(i)
      }
    }

    if (dataDiffPositions.length === 0) {
      return
    }

    memory = dataMap(dataDiffPositions, data, memory)

    // Figure out what changed.
    const memoryDiff: { [key: string]: {} } = {}

    let count = 0

    for (let o in memoryCache) {
      for (let y in memory[o]) {
        if (memory[o][y] != memoryCache[o][y]) {
          if (!memoryDiff.hasOwnProperty(o)) {
            memoryDiff[o] = {}
          }
          eventEmitter.emit(o + '-' + y, memory[o][y]) // for example, wheel-turn
          memoryDiff[o][y] = memory[o][y]
          count = count + 1
        }
      }
    }

    if (count > 0) {
      if (options.debug) {
        console.log(memoryDiff)
      }

      // emit changes only
      eventEmitter.emit('changes', memoryDiff)
    }

    // emit everything in all event
    eventEmitter.emit('all', memory)

    // emit raw data
    eventEmitter.emit('data', data)

    // set global variables for next event
    memoryPrev = memory
    dataPrev = data
  })

  if (device !== undefined) {
    device.on('error', function (err) {
      if (options.debug) {
        console.log(chalk.red('device error -> '), JSON.stringify(err), err)
      }
    })
  }

  leds(0)

  if (options.debug) {
    console.log(chalk.cyan('listen -> listening'))
  }

  callback(null)
}
