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
