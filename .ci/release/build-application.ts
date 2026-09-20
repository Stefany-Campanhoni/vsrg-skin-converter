import { mkdir } from "node:fs/promises"
import path from "node:path"
import packageJson from "../../package.json" with { type: "json" }
import { getReleasePaths } from "./release-config.ts"

export interface BuildApplicationOptions {
  readonly entryPoint: string
  readonly outputFile: string
}

export async function buildApplication(options: BuildApplicationOptions): Promise<void> {
  const entryPoint = path.resolve(options.entryPoint)
  const outputFile = path.resolve(options.outputFile)
  await mkdir(path.dirname(outputFile), { recursive: true })
  try {
    const result = await Bun.build({
      entrypoints: [entryPoint],
      outdir: path.dirname(outputFile),
      naming: path.basename(outputFile),
      target: "bun",
      format: "esm",
      external: ["sharp"],
      sourcemap: "none",
    })
    if (!result.success) {
      throw new AggregateError(result.logs, `Bun.build failed for ${entryPoint}`)
    }
    if (result.outputs.length !== 1 || path.resolve(result.outputs[0]?.path ?? "") !== outputFile) {
      throw new Error(`Bun.build produced an unexpected output set for ${entryPoint}`)
    }
  } catch (error) {
    throw new Error(`Failed to build application from ${entryPoint} to ${outputFile}`, {
      cause: error,
    })
  }
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(import.meta.dir, "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  await buildApplication({
    entryPoint: path.join(projectRoot, "src", "cli.ts"),
    outputFile: paths.bundlePath,
  })
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
