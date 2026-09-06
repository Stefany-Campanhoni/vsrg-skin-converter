const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()

export function utf8Bytes(source: string): Uint8Array {
  return utf8Encoder.encode(source)
}

export function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes)
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  return new Uint8Array(Bun.concatArrayBuffers([...chunks]))
}

export function utf16LittleEndianBytes(source: string): Uint8Array {
  return utf16Bytes(source, true)
}

export function utf16BigEndianBytes(source: string): Uint8Array {
  return utf16Bytes(source, false)
}

function utf16Bytes(source: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(source.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < source.length; index += 1) {
    view.setUint16(index * 2, source.charCodeAt(index), littleEndian)
  }
  return bytes
}
