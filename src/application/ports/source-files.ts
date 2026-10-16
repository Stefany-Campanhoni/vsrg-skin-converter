export interface SourceEntry {
  readonly name: string
  readonly kind: "file" | "directory"
}
export interface SourceFiles {
  list(relativeDirectory: string): Promise<readonly SourceEntry[]>
  readBytes(relativePath: string): Promise<Uint8Array>
  assetId(relativePath: string): string
  ownsAsset(id: string): boolean
  readAsset(id: string): Promise<Uint8Array>
}
export class SourceFileNotFoundError extends Error {}
export interface ReadableSourceFile {
  readonly name: string
  readonly webkitRelativePath?: string
  readonly size: number
  arrayBuffer(): Promise<ArrayBuffer>
}
export interface ReadableFileHandle {
  readonly kind: "file"
  readonly name: string
  getFile(): Promise<ReadableSourceFile>
}
export interface ReadableDirectoryHandle {
  readonly kind: "directory"
  readonly name: string
  values(): AsyncIterable<ReadableFileHandle | ReadableDirectoryHandle>
  getDirectoryHandle(name: string): Promise<ReadableDirectoryHandle>
  getFileHandle(name: string): Promise<ReadableFileHandle>
}
