import { mkdir } from "node:fs/promises"
import path from "node:path"
import { build } from "esbuild"
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
    await build({
      entryPoints: [entryPoint],
      outfile: outputFile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      external: ["sharp"],
      banner: {
        js: "globalThis.Bun ??= { argv: globalThis.process.argv, env: globalThis.process.env };",
      },
      sourcemap: false,
      legalComments: "none",
    })
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
