import * as events from 'events'
import * as hid from 'node-hid'
import * as os from 'os'

import { Chalk } from 'chalk'
import { LogitechG29Options } from './typescript'
import { RigState } from './models/rig-state'
import { getWheelDevicePath } from './utils'
import { updateState } from './data-map'

const chalk = new Chalk()

let device: hid.HID | undefined = undefined

let prependWrite = false

if (os.platform() === 'win32') {
  prependWrite = true
}

// TODO: fix
// let options: LogitechG29Options = {
//   autocenter: true,
//   debug: false,
//   range: 900,
// }

let lastLedValue = 0

let lastState = new RigState()

export class LogitechG29 {
  constructor(options: LogitechG29Options) {
    this.options = {
      ...options,
      range: Math.min(Math.max(options.range, 40), 900),
    }

    if (options.debug) {
      console.log(chalk.cyan('userOptions -> '), options)
    }
  }

  eventEmitter = new events.EventEmitter()
  options: LogitechG29Options
  lastData = new Array(12).fill(0)

  /**
   * Set wheel autocentering based on existing options.
   */
  autoCenter = () => {
    const autocenter = this.options.autocenter

    if (autocenter) {
      // auto-center on
      this.relayOS([0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

      if (Array.isArray(autocenter) && autocenter.length === 2) {
        // custom auto-center

        // byte 3-4 is effect strength, 0x00 to 0x0f
        autocenter[0] = Math.round(autocenter[0] * 15)

        // byte 5 is the rate the effect strength rises as the wheel turns, 0x00 to 0xff
        autocenter[1] = Math.round(autocenter[1] * 255)

        this.relayOS([
          0xfe,
          0x0d,
          autocenter[0],
          autocenter[0],
          autocenter[1],
          0x00,
          0x00,
          0x00,
        ])
      } else {
        // use default strength profile
        this.relayOS([0xfe, 0x0d, 0x07, 0x07, 0xff, 0x00, 0x00, 0x00])
      }
    } else {
      // auto-center off
      this.relayOS([0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    }
  }

  /**
   * Connect to a Logitech G29 wheel.
   * @param odo Options object or callback function.
   * @param onError Callback function.
   */
  connect = async () => {
    return new Promise<void>((resolve, reject) => {
      device = new hid.HID(getWheelDevicePath(this.options))

      device.read((err: any, data) => {
        if (err) {
          if (this.options.debug) {
            console.log(chalk.red('connect -> Error reading from device.'), err)
          }

          reject(err)
        } else {
          this.forceOff()

          if (data.length === 12) {
            // wheel is already in high precision mode

            if (this.options.debug) {
              console.log(
                chalk.cyan('connect -> Wheel already in high precision mode.')
              )
            }

            this.listen(true)

            resolve()
          } else {
            // wheel is not in high precision mode

            if (this.options.debug) {
              console.log(chalk.cyan('connect -> Initing'))
            }

            try {
              // G29 Wheel init from - https://github.com/torvalds/linux/blob/master/drivers/hid/hid-lg4ff.c
              this.relayOS([0xf8, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00])
              this.relayOS([0xf8, 0x09, 0x05, 0x01, 0x01, 0x00, 0x00])

              // wait for wheel to finish calibrating
              setTimeout(() => {
                this.listen(false)

                resolve()
              }, 8000)
            } catch (err) {
              reject(err)
            }
          }
        }
      })

      // move the wheel to generate a read event
      this.forceConstant(1)
    })
  }

  /**
   * Disconnect in preparation to connect again or to allow other software to use the wheel.
   */
  disconnect = () => {
    device?.close()
  }

  /**
   * Set or disable a constant force effect.
   * @param number Number between 0 and 1. Optional.
   */
  forceConstant = (number: number = 0.5) => {
    if (number === 0.5) {
      this.forceOff(1)
      return
    }

    this.relayOS([
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
  forceFriction = (number: number = 0) => {
    if (number === 0) {
      this.forceOff(2)
      return
    }

    // sending manual relay() commands to the hardware seems to reveal a 0x00 through 0x07 range
    // 0x07 is the strongest friction and then 0x08 is no friction
    // friction ramps up again from 0x08 to 0x0F
    number = Math.round(number * 7)

    // the first "number" is for left rotation, the second for right rotation
    this.relayOS([0x21, 0x02, number, 0x00, number, 0x00, 0x00])
  }

  /**
   * Turn off all force effects except auto-centering.
   * @param slot Number between 0 and 4. Optional.
   */
  forceOff = (slot: number = 0) => {
    // Great info at http://wiibrew.org/wiki/Logitech_USB_steering_wheel, especially about writing to more than one effect slot.
    if (slot === 0) {
      slot = 0xf3
    } else {
      slot = parseInt(`0x${slot.toFixed(0)}0`)
    }

    // turn off effects (except for auto-center)
    this.relayOS([slot, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  }

  /**
   * Control the shift indicator LEDs.
   * @param value Array setting. Optional. See API documentation for more info.
   */
  leds = (value: number) => {
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

    this.relayOS([0xf8, 0x12, value, 0x00, 0x00, 0x00, 0x01])

    lastLedValue = value
  }

  /**
   * @param ready True if the wheel is ready for commands. Optional.
   * @param callback Optional callback function.
   */
  listen = (ready: boolean) => {
    if (!ready) {
      device?.close()
      device = new hid.HID(getWheelDevicePath(this.options))
    }

    this.setRange()
    this.autoCenter()

    device?.on('data', (data: number[]) => {
      // reset memory
      const state = structuredClone(lastState)
      const memoryCache = structuredClone(lastState)

      updateState(data, this.lastData, state)

      // Figure out what changed.
      const memoryDiff: { [key: string]: {} } = {}

      let count = 0

      for (let o in memoryCache) {
        for (let y in state[o]) {
          if (state[o][y] != memoryCache[o][y]) {
            if (!memoryDiff.hasOwnProperty(o)) {
              memoryDiff[o] = {}
            }
            this.eventEmitter.emit(o + '-' + y, state[o][y]) // for example, wheel-turn
            memoryDiff[o][y] = state[o][y]
            count = count + 1
          }
        }
      }

      if (count > 0) {
        if (this.options.debug) {
          console.log(memoryDiff)
        }

        // emit changes only
        this.eventEmitter.emit('changes', memoryDiff)
      }

      // emit everything in all event
      this.eventEmitter.emit('all', state)

      // emit raw data
      this.eventEmitter.emit('data', data)

      // set global variables for next event
      lastState = state
      this.lastData = data
    })

    device?.on('error', (err) => {
      if (this.options.debug) {
        console.log(chalk.red('device error -> '), JSON.stringify(err), err)
      }

      this.eventEmitter.emit('error', err)
    })

    this.leds(0)

    if (this.options.debug) {
      console.log(chalk.cyan('listen -> listening'))
    }

    this.eventEmitter.emit('ready')
  }

  on = (eventName: string, callback: () => void) => {
    return this.eventEmitter.on(eventName, callback)
  }

  once = (eventName: string, callback: () => void) => {
    return this.eventEmitter.once(eventName, callback)
  }

  /**
   * Relay low level commands directly to the hardware.
   * @param data Array of data to write. For example: [0x00, 0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01].
   */
  relay = (data: number[]) => {
    device?.write(data)
  }

  /**
   * Relay low level commands directly to the hardware after applying OS specific tweaks, if needed.
   * @param data Array of data to write. For example: [0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01]
   */
  relayOS = (data: number[]) => {
    if (prependWrite) {
      data.unshift(0x00)
    }

    this.relay(data)
  }

  /**
   * Set wheel range.
   */
  setRange = () => {
    const range1 = this.options.range & 0x00ff
    const range2 = (this.options.range & 0xff00) >> 8

    this.relayOS([0xf8, 0x81, range1, range2, 0x00, 0x00, 0x00])
  }
}
