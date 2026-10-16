import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
export function etternaInstallationGuide(skin: VisualSkinModel, judgementFilename: string): string {
  return `# Install your converted Etterna skin
Copy NoteSkins/dance/${skin.metadata.name}/ into the same directory inside your Etterna installation.
Copy Assets/Judgments/${judgementFilename} into Assets/Judgments/ and select it in your theme's asset settings.

Back up your existing playerConfig.lua. Apply the visual keys in profile-settings/playerConfig.lua to your existing profile's <theme>_settings/playerConfig.lua:
ReceptorSize, GameplayXYCoordinates["4K"] (NoteFieldY, JudgmentY, ComboY), GameplaySizes["4K"] (ComboZoom and JudgmentZoom), ConvertedAspectRatio, CurrentWidth and CurrentHeight.
The coordinate space is 1280x720 and compatible with Rebirth. Review support before applying these keys to other themes.
Preserve your unrelated settings and speed modifiers. No numbered profile, Etterna.xml, GUID or assetsConfig.lua replacement is included.
Your converted ReceptorSize is ${skin.playfield.columnWidth}. Set scroll speed manually with https://cmodcalc.com/ using this receptor size.
The osu! source's ${skin.playfield.isDownscroll ? "downscroll" : "upscroll"} direction requires ${skin.playfield.isDownscroll ? "omitting Reverse" : "enabling Reverse"} in your own gameplay modifiers.
`
}
