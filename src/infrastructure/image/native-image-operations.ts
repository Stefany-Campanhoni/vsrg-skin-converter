import { createImageOperations } from "./shared-image-operations.ts"
import { createSharpImageBackend } from "./sharp-image-backend.ts"
export const nativeRasterBackend = createSharpImageBackend()
export const nativeImageOperations = createImageOperations(
  {
    async read(filePath) {
      return new Uint8Array(await Bun.file(filePath).arrayBuffer())
    },
  },
  nativeRasterBackend,
)
