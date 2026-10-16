import { expect, test } from "bun:test"
import { buildWeb } from "../../.ci/web/build-web.ts"

test("static browser build carries local resources and complete templates", async () => {
  await buildWeb()
  for (const name of [
    "index.html",
    "main.js",
    "conversion-worker.js",
    "vips/vips.wasm",
    "vips/vips-es6.js",
    "coi-serviceworker.js",
    "templates/osu/skin.ini",
    "templates/etterna/profile/playerConfig.lua",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    expect(await Bun.file(`build/web/${name}`).exists()).toBe(true)
  }
  expect(await Bun.file("build/web/main.js").text()).not.toMatch(/https?:\/\/.*(?:\.wasm|\.js)["']/)
})
