import { sourceIsAbsolute } from "../../../infrastructure/filesystem/source-relative-path.ts"

const windowsReservedDeviceName = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i
export function assertSafeEtternaDirectorySegment(value: string, label: string): void {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    sourceIsAbsolute(value) ||
    hasWindowsInvalidCharacter(value) ||
    /[. ]$/.test(value) ||
    windowsReservedDeviceName.test(value)
  ) {
    throw new Error(`Unsafe Etterna ${label}: ${JSON.stringify(value)}`)
  }
}

function hasWindowsInvalidCharacter(value: string): boolean {
  const invalidCharacters = '<>:"/\\|?*'
  return [...value].some(
    (character) => character.charCodeAt(0) < 32 || invalidCharacters.includes(character),
  )
}
