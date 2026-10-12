import { SourceFileNotFoundError, type SourceFiles } from "../../application/ports/source-files.ts"
import { sourceJoin, sourceRelativePath } from "./source-relative-path.ts"
export async function resolveSourcePath(
  source: SourceFiles,
  requested: string,
  kind: "file" | "directory" = "file",
): Promise<string> {
  const segments = sourceRelativePath(requested).split("/")
  let directory = ""
  for (const [index, segment] of segments.entries()) {
    const matches = (await source.list(directory)).filter(
      (entry) => entry.name.toLowerCase() === segment.toLowerCase(),
    )
    if (matches.length === 0)
      throw new SourceFileNotFoundError(`Source path '${requested}' was not found`)
    if (matches.length !== 1)
      throw new Error(`Source path '${requested}' is ambiguous ignoring case`)
    const entry = matches[0]
    if (!entry || entry.kind !== (index === segments.length - 1 ? kind : "directory"))
      throw new Error(`Source path '${requested}' has an invalid file/directory kind`)
    directory = sourceJoin(directory, entry.name)
  }
  return directory
}
export async function listSourceFiles(
  source: SourceFiles,
  directory: string,
): Promise<readonly string[]> {
  const files: string[] = []
  for (const entry of await source.list(directory)) {
    const path = sourceJoin(directory, entry.name)
    if (entry.kind === "file") files.push(path)
    else files.push(...(await listSourceFiles(source, path)))
  }
  return files
}
