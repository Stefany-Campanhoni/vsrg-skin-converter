import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import packageJson from "../../package.json" with { type: "json" }
import { expectTruthy } from "../support/expectations.ts"

const contactEmail = "scampanhoni@gmail.com"

test("declares a safe public version and the GPL-3.0-only license", () => {
  expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  expect(packageJson.license).toBe("GPL-3.0-only")
})

test("ships the GPL, Bun notice, and template contact in portable documentation", async () => {
  const [license, sourceReadme, portableReadme, notices] = await Promise.all([
    readFile(new URL("../../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../../readme.md", import.meta.url), "utf8"),
    readFile(new URL("../../distribution/README.txt", import.meta.url), "utf8"),
    readFile(new URL("../../distribution/THIRD-PARTY-NOTICES.txt", import.meta.url), "utf8"),
  ])

  expect(license).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/)
  expectTruthy(sourceReadme.includes(contactEmail))
  expectTruthy(portableReadme.includes(contactEmail))
  expect(portableReadme).toMatch(/Bun 1\.4\.0 is included/i)
  expect(notices).toMatch(/Bun 1\.4\.0[\s\S]*oven-sh\/bun/i)
  expect(notices).not.toMatch(/Node\.js 22\.23\.2/i)
})
