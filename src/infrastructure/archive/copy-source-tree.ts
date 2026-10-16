import type { GeneratedFiles } from "../../application/ports/generated-files.ts"
import type { SourceFiles } from "../../application/ports/source-files.ts"
import { listSourceFiles } from "../filesystem/resolve-source-path.ts"
import { sourceJoin } from "../filesystem/source-relative-path.ts"
export async function copySourceTree(
  source: SourceFiles,
  directory: string,
  output: GeneratedFiles,
  prefix: string,
): Promise<void> {
  for (const path of await listSourceFiles(source, directory)) {
    const relative = directory ? path.slice(directory.length + 1) : path
    await output.write(sourceJoin(prefix, relative), await source.readBytes(path))
  }
}
