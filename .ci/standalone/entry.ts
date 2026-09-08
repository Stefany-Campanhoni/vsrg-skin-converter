import packageJson from "../../package.json" with { type: "json" }

const args = Bun.argv.slice(2)

if (args[0] === "--standalone-smoke-sharp") {
  const inputPath = args[1]
  const outputPath = args[2]
  if (args.length !== 3 || !inputPath || !outputPath) {
    throw new Error("Standalone Sharp smoke expects input and output PNG paths")
  }
  const sharp = (await import("sharp")).default
  await sharp(inputPath).resize(2, 2, { fit: "fill" }).png().toFile(outputPath)
  console.log("Sharp standalone smoke passed")
} else {
  void packageJson.version
  await import("../../src/cli.ts")
}
