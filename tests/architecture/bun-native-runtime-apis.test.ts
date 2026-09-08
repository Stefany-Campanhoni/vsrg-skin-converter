import { expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import path from "node:path"

const sourceRoots = ["src", ".ci", "tests"] as const
const typescriptExtensions = [".ts", ".tsx", ".mts", ".cts"] as const
const bareNodeBuiltins = new Set([
  "_http_agent",
  "_http_client",
  "_http_common",
  "_http_incoming",
  "_http_outgoing",
  "_http_server",
  "_stream_duplex",
  "_stream_passthrough",
  "_stream_readable",
  "_stream_transform",
  "_stream_wrap",
  "_stream_writable",
  "_tls_common",
  "_tls_wrap",
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "dns/promises",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "inspector/promises",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "readline/promises",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "undici",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "ws",
  "zlib",
])
const allowedProductionFsPromiseFiles = new Set([
  ".ci/release/acquire-bun-runtime.ts",
  ".ci/release/assemble-windows-portable.ts",
  ".ci/release/build-application.ts",
  ".ci/release/create-windows-release.ts",
  ".ci/release/install-runtime-dependencies.ts",
  ".ci/release/verify-windows-portable.ts",
  "src/adapters/etterna/assets/read-etterna-judgement-selection.ts",
  "src/adapters/etterna/catalog/etterna-skin-catalog.ts",
  "src/adapters/etterna/noteskin/note-skin-context.ts",
  "src/adapters/etterna/noteskin/resolve-skin-files.ts",
  "src/adapters/etterna/profile/allocate-etterna-profile-identity.ts",
  "src/adapters/etterna/profile/etterna-profile-catalog.ts",
  "src/adapters/etterna/profile/read-etterna-profile.ts",
  "src/adapters/etterna/templates/render-etterna-profile.ts",
  "src/adapters/etterna/writer/write-prepared-etterna-assets.ts",
  "src/adapters/osu/assets/resolve-osu-png-asset.ts",
  "src/adapters/osu/catalog/osu-skin-catalog.ts",
  "src/adapters/osu/config/osu-user-configuration.ts",
  "src/adapters/osu/config/prepare-osu-user-configuration-update.ts",
  "src/adapters/osu/reader/osu-skin-reader.ts",
  "src/adapters/osu/writer/remove-osu-template-artifacts.ts",
  "src/adapters/osu/writer/write-osu-judgements.ts",
  "src/adapters/osu/writer/write-osu-long-notes.ts",
  "src/adapters/osu/writer/write-osu-notes.ts",
  "src/adapters/osu/writer/write-osu-receptors.ts",
  "src/cli/installation-directory.ts",
  "src/infrastructure/filesystem/copy-directory.ts",
  "src/infrastructure/filesystem/transactional-output-publisher.ts",
  "src/infrastructure/filesystem/transactional-output-set-publisher.ts",
])
const allowedDirectFsFiles = new Set([
  "src/infrastructure/lua/parse-lua-file.test.ts",
  "src/infrastructure/lua/parse-lua-file.ts",
])
const allowedCommonProcessProperties = new Set(["cwd", "exitCode", "platform"])
const allowedSpecialProcessUses = [
  "src/cli/prompts.ts: process.stdin",
  "src/config/paths.test.ts: process.chdir",
  "src/config/paths.test.ts: process.chdir",
] as const

interface NodeImportUse {
  readonly file: string
  readonly kind: string
  readonly specifier: string
}

interface ProcessUse {
  readonly file: string
  readonly property: string
}

async function collectSourceFiles(): Promise<string[]> {
  const files: string[] = []

  for (const root of sourceRoots) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !typescriptExtensions.some((extension) => entry.name.endsWith(extension))
      )
        continue
      files.push(path.join(entry.parentPath, entry.name).replaceAll("\\", "/"))
    }
  }
  return files.sort()
}

function inspectSource(
  file: string,
  source: string,
): { nodeImports: NodeImportUse[]; processUses: ProcessUse[]; violations: string[] } {
  const nodeImports: NodeImportUse[] = []
  const processUses: ProcessUse[] = []
  const violations: string[] = []
  const loader = file.endsWith(".tsx") ? "tsx" : "ts"
  const uniqueSuffix = crypto.randomUUID().replaceAll("-", "")
  const processReplacement = `__bun_guard_process_${uniqueSuffix}`
  const bufferReplacement = `__bun_guard_buffer_${uniqueSuffix}`
  const globalReplacements = [
    `__bun_guard_global_this_${uniqueSuffix}`,
    `__bun_guard_global_${uniqueSuffix}`,
    `__bun_guard_window_${uniqueSuffix}`,
  ]
  const transpiler = new Bun.Transpiler({
    loader,
    define: {
      process: processReplacement,
      Buffer: bufferReplacement,
      globalThis: globalReplacements[0] ?? "",
      global: globalReplacements[1] ?? "",
      window: globalReplacements[2] ?? "",
    },
  })
  const scan = transpiler.scan(source)
  for (const imported of scan.imports) {
    if (imported.path.startsWith("node:") || bareNodeBuiltins.has(imported.path)) {
      nodeImports.push({ file, kind: imported.kind, specifier: imported.path })
    }
  }

  const transformedSource = transpiler.transformSync(source)
  const globalRoots = collectGlobalRootAliases(transformedSource, globalReplacements)
  const processIdentifier = new RegExp(`\\b${processReplacement}\\b`, "gu")
  const processProperty = new RegExp(`^${processReplacement}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, "u")
  for (const match of transformedSource.matchAll(processIdentifier)) {
    const access = transformedSource.slice(match.index).match(processProperty)
    if (access?.[1]) processUses.push({ file, property: access[1] })
    else violations.push(`${file}: unsupported direct or computed process access`)
  }
  if (hasGlobalPropertyAccess(transformedSource, globalRoots, "process")) {
    violations.push(`${file}: unsupported direct or computed process access`)
  }
  if (
    new RegExp(`\\b${bufferReplacement}\\b`, "u").test(transformedSource) ||
    hasGlobalPropertyAccess(transformedSource, globalRoots, "Buffer")
  ) {
    violations.push(`${file}: use Uint8Array and typed binary helpers instead of Buffer`)
  }

  return { nodeImports, processUses, violations }
}

function collectGlobalRootAliases(source: string, initialRoots: readonly string[]): string[] {
  const roots = new Set(initialRoots)
  let previousSize = -1
  while (roots.size !== previousSize) {
    previousSize = roots.size
    for (const root of roots) {
      const assignment = new RegExp(
        `(?<![.\\w$])(?:const\\s+|let\\s+|var\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRegExp(root)}(?=\\s*(?:[;,)\\n\\r]|$))`,
        "gu",
      )
      for (const match of source.matchAll(assignment)) {
        const alias = match[1]
        if (alias) roots.add(alias)
      }
    }
  }
  return [...roots]
}

function hasGlobalPropertyAccess(
  source: string,
  globalRoots: readonly string[],
  property: "Buffer" | "process",
): boolean {
  return globalRoots.some((root) => {
    const boundedRoot = `(?<![\\w$])${escapeRegExp(root)}(?![\\w$])`
    const directAccess = new RegExp(
      `${boundedRoot}\\s*(?:\\.\\s*${property}\\b|\\[\\s*["']${property}["']\\s*\\]|\\?\\.\\s*(?:${property}\\b|\\[\\s*["']${property}["']\\s*\\]))`,
      "u",
    )
    const destructuredAccess = new RegExp(
      `\\{[^{}]*(?:\\b${property}\\b\\s*(?=[:,}=])|["']${property}["']\\s*:)[^{}]*\\}\\s*=\\s*${boundedRoot}`,
      "u",
    )
    return directAccess.test(source) || destructuredAccess.test(source)
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function isTestFile(file: string): boolean {
  return file.endsWith(".test.ts") || file.startsWith("tests/")
}

function isAllowedNodeImport(use: NodeImportUse): boolean {
  if (use.specifier === "node:path") return use.kind === "import-statement"
  if (use.specifier === "node:os") return use.kind === "import-statement" && isTestFile(use.file)
  if (use.specifier === "node:fs") {
    return use.kind === "import-statement" && allowedDirectFsFiles.has(use.file)
  }
  if (use.specifier !== "node:fs/promises") return false
  if (isTestFile(use.file)) {
    return use.kind === "import-statement" || use.kind === "dynamic-import"
  }
  return use.kind === "import-statement" && allowedProductionFsPromiseFiles.has(use.file)
}

test("controlled code matches the explicit Node compatibility allowlist", async () => {
  const nodeImports: NodeImportUse[] = []
  const processUses: ProcessUse[] = []
  const violations: string[] = []
  for (const file of await collectSourceFiles()) {
    const result = inspectSource(file, await Bun.file(file).text())
    nodeImports.push(...result.nodeImports)
    processUses.push(...result.processUses)
    violations.push(...result.violations)
  }

  for (const use of nodeImports) {
    if (!isAllowedNodeImport(use)) {
      violations.push(`${use.file}: forbidden ${use.kind} ${use.specifier}`)
    }
  }
  const observedProductionFsFiles = new Set(
    nodeImports
      .filter((use) => use.specifier === "node:fs/promises" && !isTestFile(use.file))
      .map((use) => use.file),
  )
  expect([...observedProductionFsFiles].sort()).toEqual([...allowedProductionFsPromiseFiles].sort())
  const observedDirectFsFiles = new Set(
    nodeImports.filter((use) => use.specifier === "node:fs").map((use) => use.file),
  )
  expect([...observedDirectFsFiles].sort()).toEqual([...allowedDirectFsFiles].sort())

  const specialProcessUses = processUses
    .filter((use) => !allowedCommonProcessProperties.has(use.property))
    .map((use) => `${use.file}: process.${use.property}`)
    .sort()
  expect(specialProcessUses).toEqual([...allowedSpecialProcessUses].sort())
  expect(violations).toEqual([])
})

test("detects forbidden Node modules, process properties, and Buffer", () => {
  const result = inspectSource(
    "src/forbidden-runtime.ts",
    `
      import "node:test"
      import "node:assert/strict"
      import "_http_agent"
      import "undici"
      import "ws"
      import { createHash } from "node:crypto"
      import bareFs from "fs"
      import { Buffer as AliasedBuffer } from "buffer"
      const childProcess = import("node:child_process")
      const bareCrypto = import("crypto")
      const url = import("node:url")
      const util = import("node:util")
      const stream = import("node:stream")
      const bytes = Buffer.from("legacy")
      process.argv
      process.env
      process.execPath
    `,
  )

  expect(result.nodeImports.map((use) => `${use.kind} ${use.specifier}`).sort()).toEqual([
    "dynamic-import crypto",
    "dynamic-import node:child_process",
    "dynamic-import node:stream",
    "dynamic-import node:url",
    "dynamic-import node:util",
    "import-statement _http_agent",
    "import-statement buffer",
    "import-statement fs",
    "import-statement node:assert/strict",
    "import-statement node:crypto",
    "import-statement node:test",
    "import-statement undici",
    "import-statement ws",
  ])
  expect(result.nodeImports.every((use) => !isAllowedNodeImport(use))).toBe(true)
  expect(result.processUses).toEqual([
    { file: "src/forbidden-runtime.ts", property: "argv" },
    { file: "src/forbidden-runtime.ts", property: "env" },
    { file: "src/forbidden-runtime.ts", property: "execPath" },
  ])
  expect(result.violations).toEqual([
    "src/forbidden-runtime.ts: use Uint8Array and typed binary helpers instead of Buffer",
  ])
})

test("inspects runtime APIs inside template expressions", () => {
  const result = inspectSource(
    "src/template-expression.ts",
    "const value = `prefix $" + "{process.env.VALUE}`",
  )

  expect(result.processUses).toEqual([{ file: "src/template-expression.ts", property: "env" }])
})

test("detects computed access to the Buffer global", () => {
  const result = inspectSource(
    "src/computed-buffer.ts",
    'const bytes = globalThis["Buffer"].from("legacy")',
  )

  expect(result.violations).toEqual([
    "src/computed-buffer.ts: use Uint8Array and typed binary helpers instead of Buffer",
  ])
})

test("detects computed access to the process global", () => {
  const result = inspectSource(
    "src/computed-process.ts",
    'const value = globalThis["process"].env.VALUE',
  )

  expect(result.violations).toEqual([
    "src/computed-process.ts: unsupported direct or computed process access",
  ])
})

test("inspects runtime APIs after braces inside template-expression regex literals", () => {
  const result = inspectSource(
    "src/template-regex.ts",
    "const value = `prefix $" + '{/}/.test("}") && process.env.VALUE}`',
  )

  expect(result.processUses).toEqual([{ file: "src/template-regex.ts", property: "env" }])
})

test("detects optional and destructured access to the Buffer global", () => {
  for (const source of [
    "const first = globalThis?.Buffer",
    'const second = globalThis?.["Buffer"]',
    "const { Buffer: Bytes } = globalThis",
  ]) {
    const result = inspectSource("src/indirect-buffer.ts", source)

    expect(result.violations).toEqual([
      "src/indirect-buffer.ts: use Uint8Array and typed binary helpers instead of Buffer",
    ])
  }
})

test("detects optional and destructured access to the process global", () => {
  for (const source of [
    "const first = globalThis?.process",
    'const second = globalThis?.["process"]',
    "const { process: runtime } = globalThis",
  ]) {
    const result = inspectSource("src/indirect-process.ts", source)

    expect(result.violations).toEqual([
      "src/indirect-process.ts: unsupported direct or computed process access",
    ])
  }
})

test("detects Buffer through aliases of the global root", () => {
  const result = inspectSource(
    "src/aliased-buffer.ts",
    'const root = globalThis; const nested = root; const Bytes = nested["Buffer"]',
  )

  expect(result.violations).toEqual([
    "src/aliased-buffer.ts: use Uint8Array and typed binary helpers instead of Buffer",
  ])
})

test("detects process through aliases of the global root", () => {
  const result = inspectSource(
    "src/aliased-process.ts",
    'const root = globalThis; const runtime = root; runtime["process"].env.VALUE',
  )

  expect(result.violations).toEqual([
    "src/aliased-process.ts: unsupported direct or computed process access",
  ])
})
