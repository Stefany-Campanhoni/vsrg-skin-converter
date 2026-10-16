import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
export function osuInstallationGuide(skin: VisualSkinModel, maniaSpeed?: number): string {
  return `# Install your converted osu!mania skin
Extract the ${skin.metadata.name}/ folder into your osu!/Skins/ directory, then select it in osu! settings.
${maniaSpeed === undefined ? "No source CMod was available. Set scroll speed manually with https://cmodcalc.com/." : `Converted ManiaSpeed: ${maniaSpeed}. Close osu!, back up your own osu!.<username>.cfg and apply ManiaSpeed = ${maniaSpeed} manually if desired.`}
This download contains a skin and instructions; it does not replace a user CFG.
`
}
