import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
import { renderOwnedTemplate } from "./etterna-profile-template-content.ts"
export function renderEtternaVisualSettings(skin: VisualSkinModel, template: string): string {
  if (skin.playfield.comboScale <= 0)
    throw new Error("Etterna profile requires a positive comboScale")
  for (const [field, value] of Object.entries(skin.playfield))
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`Etterna visual settings require finite ${field}`)
  return renderOwnedTemplate("playerConfig.lua", template, {
    receptor_size: skin.playfield.columnWidth,
    hit_position: skin.playfield.hitPosition,
    combo_position: skin.playfield.comboPosition,
    judgement_position: skin.playfield.judgementPosition,
    combo_zoom: skin.playfield.comboScale,
  })
}
