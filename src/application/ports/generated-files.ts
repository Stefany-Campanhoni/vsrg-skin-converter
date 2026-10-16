export interface GeneratedFiles {
  write(relativePath: string, contents: Uint8Array): Promise<void>
  readBytes(relativePath: string): Promise<Uint8Array>
  remove(relativePath: string): Promise<void>
}
