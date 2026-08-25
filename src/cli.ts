import packageJson from "../package.json" with { type: "json" }
import { runCli } from "./cli/main.ts"
import { runCliCommand } from "./cli/run-cli-command.ts"

const args = process.argv.slice(2)
const verbose = args.includes("--verbose")
const commandArgs = args.filter((argument) => argument !== "--verbose")

runCliCommand(commandArgs, {
  version: packageJson.version,
  writeLine: console.log,
  runInteractiveCli: runCli,
}).catch((error: unknown) => {
  console.error(
    verbose || process.env.npm_lifecycle_event === "dev"
      ? error
      : error instanceof Error
        ? error.message
        : String(error),
  )
  process.exitCode = 1
})
