import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import packageJson from "../../package.json" with { type: "json" }
import { runCapturedSubprocess, type SubprocessResult } from "../runtime/run-subprocess.ts"
import {
  assertStandaloneBunRuntime,
  getStandalonePaths,
  type StandalonePaths,
  standaloneNativeAssets,
  standaloneSharpVersion,
  standaloneTarget,
} from "./standalone-config.ts"

const virtualAssetNamespace = "standalone-sharp-assets"
const virtualAssetPrefix = "standalone-sharp:"

export async function buildStandaloneCandidate(projectRoot: string): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("The standalone experiment can only be built and smoke-tested on Windows")
  }

  assertStandaloneBunRuntime(Bun.version, Bun.revision)

  const paths = getStandalonePaths(projectRoot, packageJson.version)
  await assertSharpPackageVersion(paths.projectRoot)
  await rm(paths.buildRoot, { recursive: true, force: true })
  await mkdir(paths.buildRoot, { recursive: true })
  await compileCandidate(paths)
  await smokeTestCandidate(paths)
  return paths.outputFile
}

async function assertSharpPackageVersion(projectRoot: string): Promise<void> {
  for (const packagePath of [
    path.join(projectRoot, "node_modules", "sharp", "package.json"),
    path.join(projectRoot, "node_modules", "@img", "sharp-win32-x64", "package.json"),
  ]) {
    const value: unknown = await Bun.file(packagePath).json()
    if (!isVersionedPackage(value) || value.version !== standaloneSharpVersion) {
      const found = isVersionedPackage(value)
        ? JSON.stringify(value.version)
        : "an invalid package manifest"
      throw new Error(`Expected Sharp ${standaloneSharpVersion} at ${packagePath}, found ${found}`)
    }
  }
}

function isVersionedPackage(value: unknown): value is { readonly version: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string"
  )
}

async function compileCandidate(paths: StandalonePaths): Promise<void> {
  const sharpPackageRoot = path.join(
    paths.projectRoot,
    "node_modules",
    "@img",
    "sharp-win32-x64",
    "lib",
  )
  const sharpLoader = path.join(paths.projectRoot, "node_modules", "sharp", "dist", "sharp.mjs")
  const nativeLoader = path.join(import.meta.dir, "embedded-sharp-loader.ts")
  const nativeSources = new Map(
    standaloneNativeAssets.map((asset) => [
      virtualAssetPrefix + assetKey(asset.runtimeName),
      {
        sourcePath: path.join(sharpPackageRoot, asset.sourceName),
        expectedSha256: asset.sha256,
      },
    ]),
  )
  const nativeChecksums = new Map(
    [...nativeSources.values()].map((source) => [
      path.resolve(source.sourcePath),
      source.expectedSha256,
    ]),
  )

  const result = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "entry.ts")],
    compile: {
      target: standaloneTarget,
      outfile: paths.outputFile,
      assets: [path.join(paths.projectRoot, "src", "templates")],
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    sourcemap: "none",
    plugins: [
      {
        name: "embedded-sharp-win32-x64",
        setup(builder) {
          builder.onResolve({ filter: /^standalone-sharp:/u }, (args) => {
            const source = nativeSources.get(args.path)
            if (!source) throw new Error(`Unknown standalone Sharp asset: ${args.path}`)
            return {
              path: source.sourcePath,
              namespace: virtualAssetNamespace,
            }
          })
          builder.onLoad({ filter: /.*/u, namespace: virtualAssetNamespace }, async (args) => {
            const source = Bun.file(args.path)
            if (!(await source.exists())) {
              throw new Error(`Missing standalone Sharp asset: ${args.path}`)
            }
            const bytes = await source.bytes()
            const actualSha256 = sha256(bytes)
            const expectedSha256 = nativeChecksums.get(path.resolve(args.path))
            if (!expectedSha256) {
              throw new Error(`Standalone Sharp asset has no pinned checksum: ${args.path}`)
            }
            if (actualSha256 !== expectedSha256) {
              throw new Error(
                "Standalone Sharp asset checksum mismatch for " +
                  args.path +
                  ": expected " +
                  expectedSha256 +
                  ", found " +
                  actualSha256,
              )
            }
            return { contents: bytes, loader: "file" }
          })
          builder.onLoad({ filter: /sharp[\\/]dist[\\/]sharp\.mjs$/u }, (args) => {
            if (path.resolve(args.path) !== path.resolve(sharpLoader)) return undefined
            return {
              contents: `export { default } from ${JSON.stringify(modulePath(nativeLoader))}`,
              loader: "js",
            }
          })
        },
      },
    ],
  })

  if (!result.success) {
    throw new AggregateError(result.logs, "Bun failed to compile the standalone candidate")
  }
  if (!(await Bun.file(paths.outputFile).exists())) {
    throw new Error(`Bun did not create the standalone candidate: ${paths.outputFile}`)
  }
}

function assetKey(runtimeName: string): string {
  if (runtimeName.endsWith(".node")) return "addon"
  if (runtimeName === "libvips-42.dll") return "libvips"
  if (runtimeName.startsWith("libvips-cpp-")) return "libvips-cpp"
  throw new Error(`Unsupported standalone Sharp asset: ${runtimeName}`)
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

async function smokeTestCandidate(paths: StandalonePaths): Promise<void> {
  await rm(paths.smokeRoot, { recursive: true, force: true })
  await mkdir(paths.smokeRoot, { recursive: true })
  const input = path.join(paths.smokeRoot, "input image.png")
  const output = path.join(paths.smokeRoot, "output image.png")
  await sharp({
    create: {
      width: 4,
      height: 3,
      channels: 4,
      background: { r: 17, g: 34, b: 51, alpha: 1 },
    },
  })
    .png()
    .toFile(input)

  const version = await runStandalone(paths, ["--version"])
  assertSuccessfulSmoke(version, "startup/version")
  if (version.stdout.trim() !== packageJson.version) {
    throw new Error(`Standalone version smoke returned unexpected output: ${version.stdout.trim()}`)
  }

  const help = await runStandalone(paths, ["--help"])
  assertSuccessfulSmoke(help, "help")
  if (!help.stdout.includes("VSRG Skin Converter") || !help.stdout.includes("Usage:")) {
    throw new Error("Standalone help smoke did not print the CLI usage")
  }

  const failure = await runStandalone(paths, ["--unknown"])
  if (failure.code === 0 || !failure.stderr.includes("Unknown argument")) {
    throw new Error(
      "Standalone exit-code smoke did not preserve failure (code " +
        failure.code +
        "): " +
        failure.stderr,
    )
  }

  const image = await runStandalone(paths, ["--standalone-smoke-sharp", input, output])
  assertSuccessfulSmoke(image, "Sharp PNG")
  const metadata = await sharp(output).metadata()
  if (metadata.format !== "png" || metadata.width !== 2 || metadata.height !== 2) {
    throw new Error("Standalone Sharp smoke produced an invalid PNG")
  }
}

async function runStandalone(
  paths: StandalonePaths,
  args: readonly string[],
): Promise<SubprocessResult> {
  return runCapturedSubprocess([paths.outputFile, ...args], {
    cwd: paths.smokeRoot,
    env: standaloneEnvironment(),
    timeoutMs: 15_000,
  })
}

function standaloneEnvironment(): Record<string, string | undefined> {
  return {
    LOCALAPPDATA: Bun.env.LOCALAPPDATA,
    PATH: "",
    SYSTEMROOT: Bun.env.SYSTEMROOT,
    TEMP: Bun.env.TEMP,
    TMP: Bun.env.TMP,
    USERPROFILE: Bun.env.USERPROFILE,
    WINDIR: Bun.env.WINDIR,
  }
}

function assertSuccessfulSmoke(result: SubprocessResult, name: string): void {
  if (result.timedOut || result.signal !== null || result.code !== 0) {
    throw new Error(
      "Standalone " +
        name +
        " smoke failed (code " +
        result.code +
        ", signal " +
        result.signal +
        "): " +
        result.stderr,
    )
  }
}

function modulePath(value: string): string {
  return value.replaceAll("\\", "/")
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(import.meta.dir, "..", "..")
  const outputFile = await buildStandaloneCandidate(projectRoot)
  console.log(`Standalone experimental candidate passed local smokes: ${outputFile}`)
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
