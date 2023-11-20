import * as colorette from 'colorette'
import * as events from 'events'
import * as hid from 'node-hid'
import * as os from 'os'

import { LogitechG29Event } from './typescript/event'
import { LogitechG29Options } from './typescript/options'
import { LogitechG29State } from './typescript/state'
import { getWheelDevicePath } from './utils'
import { updateState } from './data-map'

export class LogitechG29 {
  constructor(options: LogitechG29Options) {
    this.options = {
      ...options,
      range: Math.min(Math.max(options.range, 40), 900),
    }

    if (os.platform() === 'win32') {
      this.prependWrite = true
    }

    if (options.debug) {
      console.log(colorette.cyan('userOptions -> '), options)
    }
  }

  device: hid.HID | undefined = undefined
  eventEmitter = new events.EventEmitter()
  lastData = new Array(12).fill(0)
  lastLedValue = 0
  options: LogitechG29Options
  prependWrite = false
  state: LogitechG29State = {}

  /**
   * Set wheel autocentering based on existing options.
   */
  autoCenter = () => {
    const autocenter = this.options.autocenter

    if (autocenter) {
      // Auto center on.
      this.relayOS([0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

      if (Array.isArray(autocenter) && autocenter.length === 2) {
        // Custom auto center.

        // Byte 3-4 is effect strength, 0x00 to 0x0f.
        autocenter[0] = Math.round(autocenter[0] * 15)

        // Byte 5 is the rate the effect strength rises as the wheel turns, 0x00 to 0xff.
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
        // Use default strength profile.
        this.relayOS([0xfe, 0x0d, 0x07, 0x07, 0xff, 0x00, 0x00, 0x00])
      }
    } else {
      // Auto center off.
      this.relayOS([0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    }
  }

  /**
   * Connect to a Logitech G29 wheel.
   */
  connect = async () => {
    return new Promise<void>((resolve, reject) => {
      this.device = new hid.HID(getWheelDevicePath(this.options))

      this.device.read((err: any, data) => {
        if (err) {
          if (this.options.debug) {
            console.log(
              colorette.red('connect -> Error reading from device.'),
              err
            )
          }

          reject(err)
        } else {
          this.forceOff()

          if (data.length === 12) {
            // Wheel is already in high precision mode.

            if (this.options.debug) {
              console.log(
                colorette.cyan(
                  'connect -> Wheel already in high precision mode.'
                )
              )
            }

            this.listen(true)

            resolve()
          } else {
            // Wheel is not in high precision mode.

            if (this.options.debug) {
              console.log(colorette.cyan('connect -> Initing'))
            }

            try {
              // G29 Wheel init from - https://github.com/torvalds/linux/blob/master/drivers/hid/hid-lg4ff.c.
              this.relayOS([0xf8, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00])
              this.relayOS([0xf8, 0x09, 0x05, 0x01, 0x01, 0x00, 0x00])

              // Wait for wheel to finish calibrating.
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

      // Move the wheel to generate a read event.
      this.forceConstant(1)
    })
  }

  /**
   * Disconnect in preparation to connect again or to allow other software to use the wheel.
   */
  disconnect = () => {
    this.device?.close()
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

    // Sending manual relay() commands to the hardware seems to reveal a 0x00 through 0x07 range
    // 0x07 is the strongest friction and then 0x08 is no friction
    // friction ramps up again from 0x08 to 0x0F.
    number = Math.round(number * 7)

    // The first "number" is for left rotation, the second for right rotation.
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

    // Turn off effects (except for auto-center).
    this.relayOS([slot, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  }

  /**
   * Control the shift indicator LEDs. From outside in, mirrored on each side.
   *
   *  0 = No LEDs
   *  1 = Green One
   *  2 = Green Two
   *  4 = Orange One
   *  8 = Orange Two
   * 16 = Red
   *
   * 31 = All LEDs
   *
   * @param value A number that represents the LED state. Setting should be a number from 0 to 31.
   */
  leds = (value: number) => {
    if (this.lastLedValue === value) {
      return
    }

    value = Math.min(Math.max(value, 0), 31)

    this.relayOS([0xf8, 0x12, value, 0x00, 0x00, 0x00, 0x01])

    this.lastLedValue = value
  }

  /**
   * Control the shift indicator LEDs.
   *
   * 0 = No LEDs
   * 1 = Green One
   * 2 = Green Two
   * 3 = Orange One
   * 4 = Orange Two
   * 5 = Red
   *
   * @param value A number that represents the LED state. Setting should be a number from 0 to 5.
   */
  ledsSimple = (value: number) => {
    if (value >= 5) {
      value = 31
    } else if (value >= 4) {
      value = 15
    } else if (value >= 3) {
      value = 7
    } else if (value >= 2) {
      value = 3
    } else if (value >= 1) {
      value = 1
    } else {
      value = 0
    }

    this.leds(value)
  }

  /**
   * @param ready True if the wheel is ready for commands.
   */
  listen = (ready: boolean) => {
    if (!ready) {
      this.device?.close()
      this.device = new hid.HID(getWheelDevicePath(this.options))
    }

    this.setRange()
    this.autoCenter()

    this.device?.on('data', (data: number[]) => {
      const changes = updateState(data, this.lastData, this.state)

      if (Object.values(changes).length > 0) {
        if (this.options.debug) {
          console.log(changes)
        }

        // Emit an event for each change. For example, wheel-turn.
        for (const key in changes) {
          this.eventEmitter.emit(key, changes[key])
        }

        // Emit changes only.
        this.eventEmitter.emit('changes', changes)
      }

      // Emit everything in for all events.
      this.eventEmitter.emit('all', JSON.parse(JSON.stringify(this.state)))

      // Emit raw data.
      this.eventEmitter.emit('data', data)

      this.lastData = data
    })

    this.device?.on('error', (err) => {
      if (this.options.debug) {
        console.log(colorette.red('device error -> '), JSON.stringify(err), err)
      }

      this.eventEmitter.emit('error', err)
    })

    this.leds(0)

    if (this.options.debug) {
      console.log(colorette.cyan('listen -> listening'))
    }

    this.eventEmitter.emit('ready')
  }

  on = (eventName: LogitechG29Event, callback: (...args: any) => void) => {
    return this.eventEmitter.on(eventName, callback)
  }

  once = (eventName: LogitechG29Event, callback: (...args: any) => void) => {
    return this.eventEmitter.once(eventName, callback)
  }

  /**
   * Relay low level commands directly to the hardware.
   * @param data Array of data to write. For example: [0x00, 0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01].
   */
  relay = (data: number[]) => {
    this.device?.write(data)
  }

  /**
   * Relay low level commands directly to the hardware after applying OS specific tweaks, if needed.
   * @param data Array of data to write. For example: [0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01]
   */
  relayOS = (data: number[]) => {
    if (this.prependWrite) {
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

const g = new LogitechG29({ autocenter: false, debug: true, range: 900 })

const main = async () => {
  await g.connect()

  g.on('pedals-gas', (data) => {
    console.log(data)
  })
}

main()
