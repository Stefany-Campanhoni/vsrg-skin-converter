import { gameIds } from "../domain/game.ts"
import { askSelect, type SelectOption } from "./prompts.ts"
import { runEtternaToOsuRoute } from "./routes/run-etterna-to-osu.ts"
import { runOsuToEtternaRoute } from "./routes/run-osu-to-etterna.ts"

export interface CliDependencies {
  askSelect(message: string, options: SelectOption[]): Promise<string | undefined>
  runEtternaToOsuRoute(): Promise<void>
  runOsuToEtternaRoute(): Promise<void>
}

const defaultDependencies: CliDependencies = {
  askSelect,
  runEtternaToOsuRoute,
  runOsuToEtternaRoute,
}

export async function runCli(dependencies: CliDependencies = defaultDependencies): Promise<void> {
  const source = await dependencies.askSelect(
    "Select the source game:",
    gameIds.map((game) => ({ value: game, label: game })),
  )
  if (!source) return
  if (source === "etterna") return dependencies.runEtternaToOsuRoute()
  if (source === "osu") return dependencies.runOsuToEtternaRoute()
  throw new Error(`Unsupported source game: ${source}`)
}
