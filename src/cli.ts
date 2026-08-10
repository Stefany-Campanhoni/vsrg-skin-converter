import packageJson from "../package.json" with { type: "json" }
import { runCli } from "./cli/main.ts"
import { runCliCommand } from "./cli/run-cli-command.ts"

runCliCommand(process.argv.slice(2), {
  version: packageJson.version,
  writeLine: console.log,
  runInteractiveCli: runCli,
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
