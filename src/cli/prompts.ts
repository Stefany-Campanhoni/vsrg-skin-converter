import { cancel, isCancel, select } from "@clack/prompts"

export interface SelectOption {
  value: string
  label: string
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
