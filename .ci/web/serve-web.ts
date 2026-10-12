import path from "node:path"

const root = path.resolve("build/web")
if (Bun.argv.includes("--parity")) {
  const result = await Bun.build({
    entrypoints: ["tests/browser/image-backend-entry.ts"],
    outdir: root,
    target: "browser",
    naming: "[name].js",
  })
  if (!result.success) throw new AggregateError(result.logs, "Could not build parity harness")
  await Bun.write(
    path.join(root, "image-backend.html"),
    Bun.file("tests/browser/image-backend.html"),
  )
  for (const name of ["vips-es6.js", "vips.wasm"])
    await Bun.write(
      path.join(root, "vips", name),
      Bun.file(path.join("node_modules/wasm-vips/lib", name)),
    )
  for await (const name of new Bun.Glob("*").scan(".tmp/browser-reference"))
    await Bun.write(
      path.join(root, "reference", name),
      Bun.file(path.join(".tmp/browser-reference", name)),
    )
}
Bun.serve({
  port: 4173,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname)
    const relative = pathname.replace(/^\/vsrg-skin-converter\//, "")
    const target = path.resolve(root, relative || "index.html")
    if (!target.startsWith(root + path.sep)) return new Response("Not found", { status: 404 })
    const file = Bun.file(target)
    if (!(await file.exists())) return new Response("Not found", { status: 404 })
    return new Response(file, {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cache-Control": "no-store",
      },
    })
  },
})
