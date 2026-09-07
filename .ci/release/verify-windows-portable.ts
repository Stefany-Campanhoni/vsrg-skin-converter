import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import packageJson from "../../package.json" with { type: "json" }
import { runCapturedSubprocess, type SubprocessResult } from "../runtime/run-subprocess.ts"
import { getReleasePaths } from "./release-config.ts"

export interface VerifyWindowsPortableOptions {
  readonly packageRoot: string
  readonly sourceTemplatesRoot: string
  readonly expectedVersion?: string
  readonly runRuntimeChecks?: boolean
  readonly timeoutMs?: number
}

interface PackageEntry {
  readonly relative: string
  readonly kind: "file" | "directory" | "symlink" | "other"
}

const requiredFiles = [
  "vsrg-skin-converter.cmd",
  "app.mjs",
  "runtime/bun.exe",
  "README.txt",
  "LICENSE",
  "THIRD-PARTY-NOTICES.txt",
  "node_modules/sharp/LICENSE",
  "node_modules/detect-libc/LICENSE",
  "node_modules/semver/LICENSE",
  "node_modules/@img/colour/LICENSE.md",
  "node_modules/@img/sharp-win32-x64/LICENSE",
] as const
const forbiddenNodeExecutableName = "node" + ".exe"

function normalizedRelative(root: string, parentPath: string, name: string): string {
  return path.relative(root, path.join(parentPath, name)).replaceAll("\\", "/")
}

async function enumerate(root: string): Promise<PackageEntry[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries.map((entry) => ({
    relative: normalizedRelative(root, entry.parentPath, entry.name),
    kind: entry.isSymbolicLink()
      ? "symlink"
      : entry.isFile()
        ? "file"
        : entry.isDirectory()
          ? "directory"
          : "other",
  }))
}

function fail(packageRoot: string, entry: string, reason: string): never {
  throw new Error(`Invalid portable package ${packageRoot}: ${reason}: ${entry}`)
}

function isForbidden(relative: string): boolean {
  const lower = relative.toLowerCase()
  return (
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".cts") ||
    lower.endsWith(".mts") ||
    lower.endsWith(".wasm") ||
    /(^|\/)\.?[^/]*\.test\.[^/]+$/.test(lower) ||
    lower.endsWith(".map") ||
    lower.split("/").includes(".cache")
  )
}

function isDependencyEntry(relative: string): boolean {
  return (
    relative.startsWith("node_modules/sharp/") ||
    relative.startsWith("node_modules/detect-libc/") ||
    relative.startsWith("node_modules/semver/") ||
    relative.startsWith("node_modules/@img/colour/") ||
    relative.startsWith("node_modules/@img/sharp-win32-x64/")
  )
}

async function hashFile(file: string): Promise<string> {
  return new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex")
}

async function verifyTemplates(
  packageRoot: string,
  sourceTemplatesRoot: string,
  packageEntries: readonly PackageEntry[],
): Promise<Set<string>> {
  const sourceEntries = await enumerate(sourceTemplatesRoot)
  const expected = new Set<string>(["templates"])
  for (const sourceEntry of sourceEntries) {
    const packageEntry = `templates/${sourceEntry.relative}`
    expected.add(packageEntry)
    if (sourceEntry.kind === "symlink" || sourceEntry.kind === "other") {
      fail(packageRoot, packageEntry, "unsupported source template entry")
    }
    const actual = packageEntries.find((entry) => entry.relative === packageEntry)
    if (!actual || actual.kind !== sourceEntry.kind) {
      fail(packageRoot, packageEntry, "missing or mismatched template entry")
    }
    if (sourceEntry.kind === "file") {
      const sourceHash = await hashFile(path.join(sourceTemplatesRoot, sourceEntry.relative))
      const packageHash = await hashFile(path.join(packageRoot, packageEntry))
      if (sourceHash !== packageHash) fail(packageRoot, packageEntry, "template checksum mismatch")
    }
  }
  return expected
}

function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  windowsVerbatimArguments = false,
): Promise<SubprocessResult> {
  return runCapturedSubprocess([executable, ...args], {
    cwd,
    timeoutMs,
    windowsVerbatimArguments,
  })
}

function assertSuccessfulProcess(
  packageRoot: string,
  phase: string,
  result: SubprocessResult,
): void {
  if (result.code !== 0 || result.timedOut) {
    throw new Error(
      `${phase} failed for ${packageRoot}: exit=${result.code}, signal=${result.signal}, timedOut=${result.timedOut}, stdout=${JSON.stringify(result.stdout)}, stderr=${JSON.stringify(result.stderr)}`,
    )
  }
}

async function runLauncher(
  packageRoot: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<SubprocessResult> {
  const launcher = path.join(packageRoot, "vsrg-skin-converter.cmd")
  if (process.platform !== "win32") {
    return runProcess(launcher, args, cwd, timeoutMs)
  }
  if (launcher.includes('"') || args.some((argument) => !/^--[a-z-]+$/.test(argument))) {
    throw new Error(`Unsafe launcher command arguments for ${packageRoot}: ${JSON.stringify(args)}`)
  }
  const command = `""${launcher.replaceAll("%", "%%")}" ${args.join(" ")}"`
  return runProcess(Bun.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], cwd, timeoutMs, true)
}

async function verifyRuntime(
  packageRoot: string,
  expectedVersion: string,
  timeoutMs: number,
): Promise<void> {
  const externalCwd = path.dirname(packageRoot)
  const version = await runLauncher(packageRoot, ["--version"], externalCwd, timeoutMs)
  assertSuccessfulProcess(packageRoot, "launcher --version", version)
  if (version.stdout.trim() !== expectedVersion || version.stderr !== "") {
    throw new Error(
      `launcher --version returned unexpected output for ${packageRoot}: stdout=${JSON.stringify(version.stdout)}, stderr=${JSON.stringify(version.stderr)}`,
    )
  }

  const help = await runLauncher(packageRoot, ["--help"], externalCwd, timeoutMs)
  assertSuccessfulProcess(packageRoot, "launcher --help", help)
  if (!help.stdout.includes("Usage: vsrg-skin-converter.cmd") || help.stderr !== "") {
    throw new Error(
      `launcher --help returned unexpected output for ${packageRoot}: stdout=${JSON.stringify(help.stdout)}, stderr=${JSON.stringify(help.stderr)}`,
    )
  }

  const sharpProbe = [
    "import sharp from 'sharp';",
    "const input = await sharp({create:{width:2,height:2,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();",
    "const output = await sharp(input).resize(1,1).png().toBuffer();",
    "const metadata = await sharp(output).metadata();",
    "console.log(JSON.stringify({width:metadata.width,height:metadata.height,format:metadata.format}));",
  ].join("")
  const sharp = await runProcess(
    path.join(packageRoot, "runtime", "bun.exe"),
    ["--eval", sharpProbe],
    packageRoot,
    timeoutMs,
  )
  assertSuccessfulProcess(packageRoot, "Sharp image probe", sharp)
  let metadata: unknown
  try {
    metadata = JSON.parse(sharp.stdout)
  } catch (error) {
    throw new Error(`Sharp probe returned invalid JSON for ${packageRoot}: ${sharp.stdout}`, {
      cause: error,
    })
  }
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("width" in metadata) ||
    metadata.width !== 1 ||
    !("height" in metadata) ||
    metadata.height !== 1 ||
    !("format" in metadata) ||
    metadata.format !== "png"
  ) {
    throw new Error(`Sharp probe returned unexpected metadata for ${packageRoot}: ${sharp.stdout}`)
  }
}

export async function verifyWindowsPortable(options: VerifyWindowsPortableOptions): Promise<void> {
  const packageRoot = path.resolve(options.packageRoot)
  const sourceTemplatesRoot = path.resolve(options.sourceTemplatesRoot)
  if (!path.isAbsolute(options.packageRoot) || packageRoot === path.parse(packageRoot).root) {
    throw new Error(`Unsafe portable package root: ${options.packageRoot}`)
  }
  if (!(await stat(packageRoot)).isDirectory())
    throw new Error(`Portable package root is not a directory: ${packageRoot}`)
  if (!(await stat(sourceTemplatesRoot)).isDirectory()) {
    throw new Error(`Source templates root is not a directory: ${sourceTemplatesRoot}`)
  }

  const entries = await enumerate(packageRoot)
  const validationOrder = [...entries].sort(
    (left, right) => Number(right.kind === "file") - Number(left.kind === "file"),
  )
  for (const entry of validationOrder) {
    if (entry.kind === "symlink" || entry.kind === "other")
      fail(packageRoot, entry.relative, "unsupported entry type")
    if (isForbidden(entry.relative))
      fail(packageRoot, entry.relative, "forbidden development artifact")
    const lower = entry.relative.toLowerCase()
    if (lower.endsWith(forbiddenNodeExecutableName)) {
      fail(packageRoot, entry.relative, "forbidden Node executable")
    }
    if (lower.endsWith("bun.exe") && entry.relative !== "runtime/bun.exe") {
      fail(packageRoot, entry.relative, "unexpected Bun executable")
    }
  }

  const byRelative = new Map(entries.map((entry) => [entry.relative, entry]))
  for (const required of requiredFiles) {
    if (byRelative.get(required)?.kind !== "file")
      fail(packageRoot, required, "missing required file")
  }
  const sharpFiles = entries.filter(
    (entry) => entry.kind === "file" && entry.relative.startsWith("node_modules/sharp/"),
  )
  if (sharpFiles.length === 0) fail(packageRoot, "node_modules/sharp", "empty Sharp tree")
  const requiredDependencyTrees = [
    "node_modules/detect-libc",
    "node_modules/semver",
    "node_modules/@img/colour",
    "node_modules/@img/sharp-win32-x64",
  ]
  for (const dependencyRoot of requiredDependencyTrees) {
    if (
      !entries.some(
        (entry) => entry.kind === "file" && entry.relative.startsWith(`${dependencyRoot}/`),
      )
    ) {
      fail(packageRoot, dependencyRoot, "empty required dependency tree")
    }
  }

  const templateEntries = await verifyTemplates(packageRoot, sourceTemplatesRoot, entries)
  const fixedDirectories = new Set([
    "runtime",
    "node_modules",
    "node_modules/sharp",
    "node_modules/detect-libc",
    "node_modules/semver",
    "node_modules/@img",
    "node_modules/@img/colour",
    "node_modules/@img/sharp-win32-x64",
  ])
  const fixedFiles = new Set<string>(requiredFiles)
  for (const entry of entries) {
    if (
      !fixedFiles.has(entry.relative) &&
      !fixedDirectories.has(entry.relative) &&
      !isDependencyEntry(entry.relative) &&
      !templateEntries.has(entry.relative)
    ) {
      fail(packageRoot, entry.relative, "unexpected package entry")
    }
  }

  if (options.runRuntimeChecks !== false) {
    await verifyRuntime(
      packageRoot,
      options.expectedVersion ?? packageJson.version,
      options.timeoutMs ?? 30_000,
    )
  }
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(import.meta.dir, "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  await verifyWindowsPortable({
    packageRoot: paths.unpackedPackageRoot,
    sourceTemplatesRoot: path.join(projectRoot, "src", "templates"),
    expectedVersion: packageJson.version,
  })
  console.log(`Verified ${paths.unpackedPackageRoot}`)
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
