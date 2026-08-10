export interface CliCommandDependencies {
  readonly version: string
  writeLine(value: string): void
  runInteractiveCli(): Promise<void>
}

export async function runCliCommand(
  args: readonly string[],
  dependencies: CliCommandDependencies,
): Promise<void> {
  if (args.length === 0) return dependencies.runInteractiveCli()
  if (args.length !== 1) throw new Error("Unexpected CLI arguments: expected zero or one")
  if (args[0] === "--version") return dependencies.writeLine(dependencies.version)
  if (args[0] === "--help") {
    dependencies.writeLine(`VSRG Skin Converter ${dependencies.version}`)
    dependencies.writeLine("Usage: vsrg-skin-converter.cmd [--help|--version]")
    return
  }
  throw new Error(`Unknown argument: ${args[0]}`)
}
