import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import packageJson from "../../package.json" with { type: "json" }

const contactEmail = "scampanhoni@gmail.com"

test("declares a safe public version and the GPL-3.0-only license", () => {
  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.equal(packageJson.license, "GPL-3.0-only")
})

test("ships the GPL and template contact notice in source and portable documentation", async () => {
  const [license, sourceReadme, portableReadme] = await Promise.all([
    readFile(new URL("../../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../../readme.md", import.meta.url), "utf8"),
    readFile(new URL("../../distribution/README.txt", import.meta.url), "utf8"),
  ])

  assert.match(license, /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/)
  assert.ok(sourceReadme.includes(contactEmail))
  assert.ok(portableReadme.includes(contactEmail))
})
