export interface SubprocessResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly timedOut: boolean
}

export interface SubprocessOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly timeoutMs?: number
  readonly windowsVerbatimArguments?: boolean
}

interface CapturedSubprocess {
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly exited: Promise<number>
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  kill(): void
}

interface CapturedSpawnOptions {
  readonly cmd: string[]
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly stdin: "ignore"
  readonly stdout: "pipe"
  readonly stderr: "pipe"
  readonly windowsHide: boolean
  readonly windowsVerbatimArguments?: boolean
}

export interface CapturedSubprocessDependencies {
  readonly spawn: (options: CapturedSpawnOptions) => CapturedSubprocess
}

const capturedSubprocessDependencies: CapturedSubprocessDependencies = {
  spawn: (options) => Bun.spawn(options),
}

export async function runCapturedSubprocess(
  command: readonly string[],
  options: SubprocessOptions = {},
  dependencies: CapturedSubprocessDependencies = capturedSubprocessDependencies,
): Promise<SubprocessResult> {
  let timedOut = false
  const subprocess = dependencies.spawn({
    cmd: [...command],
    cwd: options.cwd,
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    windowsVerbatimArguments: options.windowsVerbatimArguments,
  })
  const timer =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          if (subprocess.exitCode === null && subprocess.signalCode === null) {
            timedOut = true
            subprocess.kill()
          }
        }, options.timeoutMs)
  const exit = subprocess.exited.finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })

  try {
    const [, stdout, stderr] = await Promise.all([
      exit,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ])
    return {
      stdout,
      stderr,
      code: subprocess.exitCode,
      signal: subprocess.signalCode,
      timedOut,
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function runInheritedSubprocess(
  command: readonly string[],
  options: Omit<SubprocessOptions, "timeoutMs"> = {},
): Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> {
  const subprocess = Bun.spawn({
    cmd: [...command],
    cwd: options.cwd,
    env: options.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    windowsHide: true,
    windowsVerbatimArguments: options.windowsVerbatimArguments,
  })
  await subprocess.exited
  return { code: subprocess.exitCode, signal: subprocess.signalCode }
}
