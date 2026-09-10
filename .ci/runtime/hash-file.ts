export async function hashFileSha256(file: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256")
  const reader = Bun.file(file).stream().getReader()
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      hash.update(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  return hash.digest("hex")
}
