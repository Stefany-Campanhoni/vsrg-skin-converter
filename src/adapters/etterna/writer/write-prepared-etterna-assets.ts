import { mkdir } from "node:fs/promises"
import path from "node:path"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import { writeFileContents } from "../../../infrastructure/filesystem/bun-file.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"

export type EtternaAssetWriter = (filePath: string, buffer: Uint8Array) => Promise<void>

import type { PreparedEtternaAsset } from "./prepared-etterna-asset.ts"

export type { PreparedEtternaAsset } from "./prepared-etterna-asset.ts"

export interface WritePreparedEtternaAssetsOptions {
  readonly assets: readonly PreparedEtternaAsset[]
  readonly outputDirectory: string
  readonly write?: EtternaAssetWriter
}

export async function writePreparedEtternaAssets(
  options: WritePreparedEtternaAssetsOptions,
): Promise<void> {
  const write = options.write ?? writeFileContents
  await runEtternaAssetOperation(
    `create Etterna asset output directory '${options.outputDirectory}'`,
    () => mkdir(options.outputDirectory, { recursive: true }),
  )
  await settleAll(
    options.assets.map(({ filename, buffer }) => {
      const outputPath = path.join(options.outputDirectory, filename)
      return runEtternaAssetOperation(
        `write generated Etterna asset '${filename}' to '${outputPath}'`,
        () => write(outputPath, buffer),
      )
    }),
  )
}
