import type { SourceFiles } from "../../application/ports/source-files.ts"
export async function readSourceText(source: SourceFiles, path: string): Promise<string> {
  return new TextDecoder().decode(await source.readBytes(path))
}
