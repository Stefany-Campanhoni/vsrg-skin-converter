import { readBinaryFile } from "../../../infrastructure/filesystem/bun-file.ts"

const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf])
const utf16LittleEndianBom = new Uint8Array([0xff, 0xfe])
const utf16BigEndianBom = new Uint8Array([0xfe, 0xff])

export async function readOsuSkinIniFile(filePath: string): Promise<string> {
  const contents = await readBinaryFile(filePath)
  const source = decodeOsuSkinIni(contents, filePath)
  if (source.includes("\0")) {
    throw new Error(
      `Invalid null character in osu skin.ini; UTF-16 requires a byte order mark: ${filePath}`,
    )
  }
  return source
}

function decodeOsuSkinIni(contents: Uint8Array, filePath: string): string {
  if (startsWithBytes(contents, utf8Bom)) {
    return decode(contents.subarray(utf8Bom.length), "utf-8", filePath)
  }
  if (startsWithBytes(contents, utf16LittleEndianBom)) {
    return decode(contents.subarray(utf16LittleEndianBom.length), "utf-16le", filePath)
  }
  if (startsWithBytes(contents, utf16BigEndianBom)) {
    return decode(contents.subarray(utf16BigEndianBom.length), "utf-16be", filePath)
  }
  return decode(contents, "utf-8", filePath)
}

function startsWithBytes(contents: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.length <= contents.length && prefix.every((byte, index) => contents[index] === byte)
}

function decode(contents: Uint8Array, encoding: string, filePath: string): string {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(contents)
  } catch (cause) {
    throw new Error(
      `Expected osu skin.ini to use UTF-8 or UTF-16 with a byte order mark: ${filePath}`,
      { cause },
    )
  }
}
