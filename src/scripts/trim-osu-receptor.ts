import sharp from "sharp"

const inputPath = ".tmp/key.png"
const outputPath = ".tmp/key-trimmed.png"
const metadata = await sharp(inputPath).metadata()

if (!metadata.width) {
  throw new Error(`Não foi possível determinar a largura de ${inputPath}`)
}

await sharp(inputPath)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize({ width: metadata.width, height: metadata.width, fit: "fill" })
  .png()
  .toFile(outputPath)

console.log(`Receptor recortado salvo em ${outputPath}`)
