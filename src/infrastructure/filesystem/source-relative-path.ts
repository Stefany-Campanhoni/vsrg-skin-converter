export function sourceRelativePath(value: string, allowRoot = false): string {
  const normalized = value.replace(/\\/g, "/")
  if (allowRoot && normalized === "") return ""
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes(":") ||
    normalized.includes("\0") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid source-relative path")
  return normalized
}
export function sourceBasename(value: string): string {
  return value.replace(/\\/g, "/").split("/").at(-1) ?? ""
}
export function sourceJoin(...parts: string[]): string {
  return parts.filter(Boolean).join("/")
}
export function sourceExtname(value: string): string {
  const name = sourceBasename(value)
  const dot = name.lastIndexOf(".")
  return dot < 1 ? "" : name.slice(dot)
}
export function sourceIsAbsolute(value: string): boolean {
  return /^[\\/]|^[A-Za-z]:[\\/]/.test(value)
}
