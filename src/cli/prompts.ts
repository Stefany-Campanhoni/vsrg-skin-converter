import { cancel, confirm, isCancel, select } from "@clack/prompts"

export interface SelectOption {
  value: string
  label: string
  hint?: string
}

export interface ConfirmPromptDependencies {
  confirm(options: { message: string }): Promise<unknown>
  isCancel(value: unknown): boolean
  cancel(message: string): void
}

const confirmPromptDependencies: ConfirmPromptDependencies = { confirm, isCancel, cancel }

export interface WaitForAnyKeyDependencies {
  write(message: string): Promise<void>
  input: {
    readonly isTTY?: boolean
    setRawMode(enabled: boolean): void
    resume(): void
    once(event: "data", listener: () => void): void
    pause(): void
  }
}

const waitForAnyKeyDependencies: WaitForAnyKeyDependencies = {
  write: async (message) => {
    await Bun.write(Bun.stdout, message)
  },
  input: process.stdin,
}

export async function askConfirm(
  message: string,
  dependencies: ConfirmPromptDependencies = confirmPromptDependencies,
): Promise<boolean | undefined> {
  const result = await dependencies.confirm({ message })
  if (dependencies.isCancel(result)) {
    dependencies.cancel("bye bye...")
    return undefined
  }
  return result as boolean
}

export async function askSelect(
  message: string,
  options: SelectOption[],
): Promise<string | undefined> {
  const result = await select({ message, options })
  if (isCancel(result)) {
    cancel("bye bye...")
    return undefined
  }
  return result
}

export async function waitForAnyKey(
  message: string,
  dependencies: WaitForAnyKeyDependencies = waitForAnyKeyDependencies,
): Promise<void> {
  await dependencies.write(`${message}\n`)
  if (!dependencies.input.isTTY) {
    return
  }
  await new Promise<void>((resolve) => {
    dependencies.input.setRawMode(true)
    dependencies.input.resume()
    dependencies.input.once("data", () => {
      dependencies.input.setRawMode(false)
      dependencies.input.pause()
      resolve()
    })
  })
}
