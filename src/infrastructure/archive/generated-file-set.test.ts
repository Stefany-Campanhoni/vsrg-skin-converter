import { expect, test } from "bun:test"
import { unzipSync } from "fflate"
import { createSkinArchive } from "./create-skin-archive.ts"
import { createGeneratedFileSet } from "./generated-file-set.ts"

test("generated output accounts for replacement/removal and refuses partial oversized writes", async () => {
  const output = createGeneratedFileSet(5)
  await output.write("skin/a.png", new Uint8Array([1, 2, 3, 4]))
  await output.write("skin/a.png", new Uint8Array([5]))
  await output.write("skin/b.png", new Uint8Array([6, 7, 8, 9]))
  await expect(output.write("skin/c.png", new Uint8Array([1]))).rejects.toThrow(/limit/)
  expect(output.snapshot()).toHaveLength(2)
  await output.remove("skin/b.png")
  await output.write("skin/c.png", new Uint8Array([1, 2, 3, 4]))
  const files = unzipSync(await createSkinArchive(output.snapshot()))
  expect(Object.keys(files).sort()).toEqual(["skin/a.png", "skin/c.png"])
  expect(files["skin/a.png"]).toEqual(new Uint8Array([5]))
})
test("output and archive boundaries reject traversal and ambiguous target paths", async () => {
  const output = createGeneratedFileSet(10)
  for (const relativePath of ["../private", "/private", "C:/private", "skin/../private"]) {
    await expect(output.write(relativePath, new Uint8Array())).rejects.toThrow(/path/)
    await expect(createSkinArchive([{ relativePath, contents: new Uint8Array() }])).rejects.toThrow(
      /path/,
    )
  }
  await output.write("skin/Note.png", new Uint8Array())
  await expect(output.write("skin/note.png", new Uint8Array())).rejects.toThrow(/ambiguous/)
  await expect(output.write("skin/Note.png/nested", new Uint8Array())).rejects.toThrow(/conflict/)
  await expect(output.write("skin", new Uint8Array())).rejects.toThrow(/conflict/)
})
