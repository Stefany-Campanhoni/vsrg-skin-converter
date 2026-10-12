import { expect, test } from "bun:test"
import { captureImageReference } from "../../../.ci/web/capture-image-reference.ts"
import golden from "../../../tests/fixtures/native-image-reference.json" with { type: "json" }
import { createAsymmetricImage, decodeReference } from "../../../tests/support/image-reference.ts"
import { createImageOperations } from "./shared-image-operations.ts"
import { createSharpImageBackend } from "./sharp-image-backend.ts"
import { renderNoteImage } from "./sharp-image-processor.ts"

test("shared native pipeline retains the pixel hashes captured before refactoring", async () => {
  const directory = ".tmp/reference-verification"
  await captureImageReference(directory)
  const actual: unknown = await Bun.file(`${directory}/manifest.json`).json()
  expect(actual).toStrictEqual(golden)
})

test("shared image operations preserve native frame and rotation pixels", async () => {
  const source = await createAsymmetricImage()
  const filePath = ".tmp/parity-source.png"
  await Bun.write(filePath, source)
  const ops = createImageOperations(
    {
      async read() {
        return source
      },
    },
    createSharpImageBackend(),
  )
  for (const rotation of [0, 90, 180, 270, 17]) {
    const asset = { filePath, rotation, frame: { index: 3, columns: 2, rows: 3 } }
    expect(await decodeReference(await ops.renderNote(asset))).toStrictEqual(
      await decodeReference(await renderNoteImage(asset)),
    )
  }
})
