import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
export async function buildWeb() {
  const root = path.resolve("build/web")
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
  const result = await Bun.build({
    entrypoints: ["src/web/main.ts", "src/web/conversion-worker.ts"],
    outdir: root,
    target: "browser",
    naming: "[name].js",
    minify: true,
  })
  if (!result.success) throw new AggregateError(result.logs, "Browser build failed")
  for (const name of ["index.html", "styles.css", "isolation.js"])
    await Bun.write(path.join(root, name), Bun.file(`src/web/${name}`))
  await Bun.write(
    path.join(root, "coi-serviceworker.js"),
    Bun.file("node_modules/coi-serviceworker/coi-serviceworker.js"),
  )
  for (const name of ["vips-es6.js", "vips.wasm"])
    await Bun.write(path.join(root, "vips", name), Bun.file(`node_modules/wasm-vips/lib/${name}`))
  for (const game of ["osu", "etterna"]) {
    const directory = `src/templates/${game}`,
      files: string[] = []
    for await (const name of new Bun.Glob("**/*").scan({ cwd: directory, onlyFiles: true })) {
      const relative = name.replaceAll("\\", "/")
      files.push(relative)
      await Bun.write(
        path.join(root, "templates", game, relative),
        Bun.file(path.join(directory, name)),
      )
    }
    await Bun.write(
      path.join(root, "templates", game, "manifest.json"),
      JSON.stringify(files.sort()),
    )
  }
  await Bun.write(path.join(root, "LICENSE"), Bun.file("LICENSE"))
  let notices =
    "# Browser distribution notices\n\nVSRG Skin Converter: GPL-3.0-only. Source: https://github.com/Stefany-Campanhoni/vsrg-skin-converter\n\nThe bundled default osu!mania judgement sheet derives from osu! legacy skin assets by ppy Pty Ltd, CC BY-NC 4.0: https://github.com/ppy/osu-resources/blob/master/LICENCE.md . Other bundled templates are redistributed with permission as documented in the project readme. Template assets are not covered by the program's GPL license.\n"
  for (const [title, file] of [
    ["wasm-vips", "node_modules/wasm-vips/LICENSE"],
    ["libvips and codecs", "node_modules/wasm-vips/THIRD-PARTY-NOTICES.md"],
    ["fflate", "node_modules/fflate/LICENSE"],
    ["coi-serviceworker", "node_modules/coi-serviceworker/LICENSE"],
    ["luaparse", "node_modules/luaparse/LICENSE"],
  ]) {
    if (title && file) notices += `\n## ${title}\n\n${await Bun.file(file).text()}\n`
  }
  await Bun.write(path.join(root, "THIRD_PARTY_NOTICES.md"), notices)
}
if (import.meta.main) await buildWeb()
