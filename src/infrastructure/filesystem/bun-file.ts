export function readBinaryFile(filePath: string): Promise<Uint8Array> {
  return Bun.file(filePath).bytes()
}

export function readTextFile(filePath: string): Promise<string> {
  return Bun.file(filePath).text()
}

export async function writeFileContents(
  filePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  await Bun.write(filePath, contents)
}

export async function copyFileContents(source: string, destination: string): Promise<void> {
  await Bun.write(destination, Bun.file(source))
}
