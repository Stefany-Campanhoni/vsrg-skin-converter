import fs from "node:fs"
import { cancel, isCancel, select } from "@clack/prompts"
import { supportedGames } from "./constants/game.ts"
import { createEngine } from "./engine/engine.ts"

async function main() {
  const sourceGameOut = await askSelect(
    "Select the source game:",
    supportedGames.map((game, index) => ({ value: index.toString(), label: game })),
  )

  const sourceGame = supportedGames[parseInt(sourceGameOut, 10)]
  if (!sourceGame) {
    console.log("Invalid game source")
    process.exit(1)
  }

  const engine = createEngine(sourceGame)

  const gameDir = engine.getLocation()
  if (!fs.existsSync(gameDir)) {
    // TODO: If the game is not on the default location, ask the user to input the game directory
    console.log("Folder does not exist.")
    process.exit(1)
  }

  const skins = engine.getSkins()
  const selectedSkin = await askSelect(
    "Select the skin to convert:",
    skins.map((skin) => ({ value: skin.fullPath, label: skin.name })),
  )

  const skin = skins.find((skin) => skin.fullPath === selectedSkin)
  if (!skin) {
    console.log("Invalid skin selection")
    process.exit(1)
  }

  await engine.convertSkin(skin)

  process.exit(0)
}

async function askSelect(message: string, options: { value: string; label: string }[]) {
  const out = await select({
    message: message,
    options: options,
  })

  if (isCancel(out)) {
    cancel("bye bye...")
    process.exit(0)
  }

  return out
}

main()
