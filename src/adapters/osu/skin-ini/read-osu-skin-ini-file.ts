import { readFile } from "node:fs/promises"

const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf])
const utf16LittleEndianBom = Buffer.from([0xff, 0xfe])
const utf16BigEndianBom = Buffer.from([0xfe, 0xff])

export async function readOsuSkinIniFile(filePath: string): Promise<string> {
  const contents = await readFile(filePath)
  const source = decodeOsuSkinIni(contents, filePath)
  if (source.includes("\0")) {
    throw new Error(
      `Invalid null character in osu skin.ini; UTF-16 requires a byte order mark: ${filePath}`,
    )
  }
  return source
}

function decodeOsuSkinIni(contents: Buffer, filePath: string): string {
  if (contents.subarray(0, utf8Bom.length).equals(utf8Bom)) {
    return decode(contents.subarray(utf8Bom.length), "utf-8", filePath)
  }
  if (contents.subarray(0, utf16LittleEndianBom.length).equals(utf16LittleEndianBom)) {
    return decode(contents.subarray(utf16LittleEndianBom.length), "utf-16le", filePath)
  }
  if (contents.subarray(0, utf16BigEndianBom.length).equals(utf16BigEndianBom)) {
    return decode(contents.subarray(utf16BigEndianBom.length), "utf-16be", filePath)
  }
  return decode(contents, "utf-8", filePath)
}

function decode(contents: Buffer, encoding: string, filePath: string): string {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(contents)
  } catch (cause) {
    throw new Error(
      `Expected osu skin.ini to use UTF-8 or UTF-16 with a byte order mark: ${filePath}`,
      { cause },
    )
  }
}
