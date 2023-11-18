import { DeviceErrorName } from '../typescript/device-error'

export class DeviceError extends Error {
  constructor({
    name,
    message,
    stack,
  }: {
    name: DeviceErrorName
    message: string
    stack?: string
  }) {
    super()

    this.name = name
    this.message = message
    this.stack = stack
  }
}
