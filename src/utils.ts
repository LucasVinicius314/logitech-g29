import * as hid from 'node-hid'

import { Chalk } from 'chalk'
import { DeviceError } from './errors/device-error'
import { Options } from './typescript'

const chalk = new Chalk()

/**
 * Return the USB location of a Logitech G29 wheel.
 */
export function getWheelDevicePath(options: Options): string {
  const devicePath = hid.devices().find(
    (device) =>
      // device.vendorId seems to be the only completely reliable property on each OS.
      // device.productId can not be trusted and can sometimes be wildly different.
      // device.product should be set to 'G29 Driving Force Racing Wheel'.
      // device.interface should be 0 on Windows and Linux.
      // device.usagePage should be 1 on Windows and Mac.
      device.vendorId === 1133 &&
      (device.productId === 49743 ||
        device.product === 'G29 Driving Force Racing Wheel') &&
      (device.interface === 0 || device.usagePage === 1)
  )?.path

  if (options.debug) {
    if (devicePath === undefined) {
      console.log(
        chalk.yellow(
          'getWheelDevicePath -> Oops, could not find a G29 Wheel. Is it plugged in?\n'
        )
      )
    } else {
      console.log(
        `${chalk.cyan(
          'getWheelDevicePath -> Found G29 Wheel at'
        )} ${devicePath}`
      )
    }
  }

  if (devicePath === undefined) {
    throw new DeviceError({
      name: 'DEVICE_NOT_FOUND',
      message: "Could not find a G29 Wheel. Make sure it's plugged in.",
    })
  }

  return devicePath
}
