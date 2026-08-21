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

export async function waitForAnyKey(message: string): Promise<void> {
  process.stdout.write(`${message}\n`)
  if (!process.stdin.isTTY) {
    return
  }
  await new Promise<void>((resolve) => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      resolve()
    })
  })
}
