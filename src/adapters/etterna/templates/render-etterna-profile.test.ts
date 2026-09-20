import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectRejectionSatisfies, expectTruthy } from "../../../../tests/support/expectations.ts"
import {
  type EtternaProfileTemplateRendererDependencies,
  type EtternaProfileTemplateValues,
  renderEtternaProfileTemplates,
} from "./render-etterna-profile.ts"

const playerConfigTemplatePath = path.resolve(
  "src",
  "templates",
  "etterna",
  "profile",
  "playerConfig.lua",
)

test("the production profile template makes receptor size renderable", async () => {
  const template = await readFile(playerConfigTemplatePath, "utf8")

  expect(template).toMatch(/ReceptorSize= \$\{receptor_size\}/)
  expect(template).toMatch(/JudgmentZoom= 1/)
  expect(template).toMatch(/ComboZoom= \$\{combo_zoom\}/)
})

test("the production profile declares the current Rebirth coordinate space", async () => {
  const template = await readFile(playerConfigTemplatePath, "utf8")

  expect(template).toMatch(/ConvertedAspectRatio= true/)
  expect(template).toMatch(/CurrentHeight= 720/)
  expect(template).toMatch(/CurrentWidth= 1280/)
})

test("renders each profile value for its target syntax and relocates playerConfig", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-render-"))
  try {
    await writeProfileTemplate(root)

    await renderEtternaProfileTemplates(root, "Rebirth", validValues)

    expect(await readFile(path.join(root, "Editable.ini"), "utf8")).toBe(
      "[Editable]\nDisplayName=A&B <Player>\n",
    )
    expect(await readFile(path.join(root, "Etterna.xml"), "utf8")).toBe(
      "<DisplayName>A&amp;B &lt;Player&gt;</DisplayName>\n<Guid>0123456789abcdef</Guid>\n<dance>C888, Reverse, Overhead, Pink &amp; Blue</dance>\n",
    )
    expect(await readFile(path.join(root, "Type.ini"), "utf8")).toBe("[ListPosition]\nPriority=1\n")
    expect(await readFile(path.join(root, "Rebirth_settings", "playerConfig.lua"), "utf8")).toBe(
      "return { ReceptorSize= 107, NoteFieldY= -7, ComboY= -20, JudgmentY= 4, JudgmentZoom= 0.35, ComboZoom= 0.5 }\n",
    )
    await expect(
      (() => readFile(path.join(root, "playerConfig.lua"), "utf8"))(),
    ).rejects.toMatchObject({
      code: "ENOENT",
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preserves String.replace metacharacters literally in INI and escaped XML text", async () => {
  await withProfileTemplate(async (root) => {
    const profileName = "A$$|$&|$'|$`|A&B <Player>"

    await renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, profileName })

    expect(await readFile(path.join(root, "Editable.ini"), "utf8")).toBe(
      "[Editable]\nDisplayName=A$$|$&|$'|$`|A&B <Player>\n",
    )
    expect(await readFile(path.join(root, "Etterna.xml"), "utf8")).toBe(
      "<DisplayName>A$$|$&amp;|$&apos;|$`|A&amp;B &lt;Player&gt;</DisplayName>\n<Guid>0123456789abcdef</Guid>\n<dance>C888, Reverse, Overhead, Pink &amp; Blue</dance>\n",
    )
  })
})

test("renders downscroll CMod modifiers without Reverse", async () => {
  await withProfileTemplate(async (root) => {
    await renderEtternaProfileTemplates(root, "Rebirth", {
      ...validValues,
      isDownscroll: true,
      skinName: "Down NoteSkin",
    })

    expect(await readFile(path.join(root, "Etterna.xml"), "utf8")).not.toMatch(/Reverse/)
  })
})

for (const cmod of [0, -1, 888.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`rejects an invalid CMod ${String(cmod)}`, async () => {
    await withProfileTemplate(async (root) => {
      await expect(
        (() => renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, cmod }))(),
      ).rejects.toThrow(/positive integer CMod/i)
    })
  })
}

for (const skinName of ["Pink\nBlue", "Pink\rBlue"]) {
  test("rejects a skin name containing a line break", async () => {
    await withProfileTemplate(async (root) => {
      await expect(
        (() => renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, skinName }))(),
      ).rejects.toThrow(/skin name.*line break/i)
    })
  })
}

for (const profileName of ["A\nB", "A\rB"]) {
  test(`rejects a profile name containing ${JSON.stringify(profileName[1])}`, async () => {
    await withProfileTemplate(async (root) => {
      await expect(
        (() => renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, profileName }))(),
      ).rejects.toThrow(/profile name.*line break/i)
    })
  })
}

for (const guid of ["", "0123456789abcde", "0123456789abcdeg", "0123456789ABCDEF"]) {
  test(`rejects invalid GUID ${JSON.stringify(guid)}`, async () => {
    await withProfileTemplate(async (root) => {
      await expect(
        (() => renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, guid }))(),
      ).rejects.toThrow(/guid.*16.*lowercase.*hex/i)
    })
  })
}

for (const theme of ["", ".", "..", "../Rebirth", "nested/Rebirth", "C:\\Rebirth"]) {
  test(`rejects unsafe theme ${JSON.stringify(theme)}`, async () => {
    await withProfileTemplate(async (root) => {
      await expect(
        (() => renderEtternaProfileTemplates(root, theme, validValues))(),
      ).rejects.toThrow(/unsafe.*theme/i)
    })
  })
}

for (const [field, value] of [
  ["hitPosition", Number.NaN],
  ["comboPosition", Number.POSITIVE_INFINITY],
  ["judgementPosition", Number.NEGATIVE_INFINITY],
  ["receptorSize", Number.NaN],
  ["comboScale", Number.POSITIVE_INFINITY],
] as const) {
  test(`rejects a non-finite ${field}`, async () => {
    await withProfileTemplate(async (root) => {
      await expect(
        (() =>
          renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, [field]: value }))(),
      ).rejects.toThrow(new RegExp(`finite.*${field}`, "i"))
    })
  })
}

for (const comboScale of [0, -0.1]) {
  test(`rejects a non-positive comboScale ${comboScale}`, async () => {
    await withProfileTemplate(async (root) => {
      await expect(
        (() => renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, comboScale }))(),
      ).rejects.toThrow(/positive.*comboScale/i)
    })
  })
}

test("rejects an unresolved wildcard before changing the profile", async () => {
  await withProfileTemplate(async (root) => {
    await writeFile(path.join(root, "Type.ini"), `[ListPosition]\nFuture=\${future_value}\n`)

    await expect(
      (() => renderEtternaProfileTemplates(root, "Rebirth", validValues))(),
    ).rejects.toThrow(/unresolved.*future_value.*Type\.ini/i)

    expect(await readFile(path.join(root, "Etterna.xml"), "utf8")).toBe(
      `<DisplayName>\${profile_name}</DisplayName>\n<Guid>\${guid}</Guid>\n<dance>C\${cmod}, \${is_downscroll} Overhead, \${skin_name}</dance>\n`,
    )
    expect(await readFile(path.join(root, "playerConfig.lua"), "utf8")).toBe(
      `return { ReceptorSize= \${receptor_size}, NoteFieldY= \${hit_position}, ComboY= \${combo_position}, JudgmentY= \${judgement_position}, JudgmentZoom= 0.35, ComboZoom= \${combo_zoom} }\n`,
    )
  })
})

test("rejects an unresolved wildcard whose name contains punctuation", async () => {
  await withProfileTemplate(async (root) => {
    await writeFile(path.join(root, "Type.ini"), `[ListPosition]\nFuture=\${future-value}\n`)

    await expect(
      (() => renderEtternaProfileTemplates(root, "Rebirth", validValues))(),
    ).rejects.toThrow(/unresolved.*future-value.*Type\.ini/i)
  })
})

test("rejects an unresolved wildcard matching an inherited object key", async () => {
  await withProfileTemplate(async (root) => {
    await writeFile(path.join(root, "Type.ini"), `[ListPosition]\nFuture=\${toString}\n`)

    await expect(
      (() => renderEtternaProfileTemplates(root, "Rebirth", validValues))(),
    ).rejects.toThrow(/unresolved.*toString.*Type\.ini/i)
  })
})

test("does not reinterpret wildcard-like profile text after substitution", async () => {
  await withProfileTemplate(async (root) => {
    const profileName = `Player \${literal_name}`

    await renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, profileName })

    expect(await readFile(path.join(root, "Editable.ini"), "utf8")).toBe(
      `[Editable]\nDisplayName=Player \${literal_name}\n`,
    )
    expect(await readFile(path.join(root, "Etterna.xml"), "utf8")).toBe(
      `<DisplayName>Player \${literal_name}</DisplayName>\n<Guid>0123456789abcdef</Guid>\n<dance>C888, Reverse, Overhead, Pink &amp; Blue</dance>\n`,
    )
  })
})

test("renders profile-name text matching a later owned wildcard in one pass", async () => {
  await withProfileTemplate(async (root) => {
    const profileName = `\${guid}`

    await renderEtternaProfileTemplates(root, "Rebirth", { ...validValues, profileName })

    expect(await readFile(path.join(root, "Editable.ini"), "utf8")).toBe(
      `[Editable]\nDisplayName=\${guid}\n`,
    )
    expect(await readFile(path.join(root, "Etterna.xml"), "utf8")).toBe(
      `<DisplayName>\${guid}</DisplayName>\n<Guid>0123456789abcdef</Guid>\n<dance>C888, Reverse, Overhead, Pink &amp; Blue</dance>\n`,
    )
  })
})

test("rejects a missing or duplicated owned wildcard", async () => {
  await withProfileTemplate(async (root) => {
    await writeFile(
      path.join(root, "Editable.ini"),
      `[Editable]\nDisplayName=\${profile_name}\nAlias=\${profile_name}\n`,
    )

    await expect(
      (() => renderEtternaProfileTemplates(root, "Rebirth", validValues))(),
    ).rejects.toThrow(/exactly one.*profile_name.*Editable\.ini/i)
  })
})

test("rejects a missing owned wildcard directly", async () => {
  await withProfileTemplate(async (root) => {
    await writeFile(path.join(root, "Editable.ini"), "[Editable]\nDisplayName=Fixed\n")

    await expect(
      (() => renderEtternaProfileTemplates(root, "Rebirth", validValues))(),
    ).rejects.toThrow(/exactly one.*profile_name.*Editable\.ini.*found 0/i)
  })
})

test("waits for every template read to settle before reporting a contextual failure", async () => {
  const sibling = deferred<string>()
  const failure = new Error("exact Etterna.xml read failure")
  let readCalls = 0
  const rendering = renderEtternaProfileTemplates(
    "profile",
    "Rebirth",
    validValues,
    dependencies({
      readFile: (filePath) => {
        readCalls += 1
        switch (path.basename(filePath)) {
          case "Editable.ini":
            return sibling.promise
          case "Etterna.xml":
            return Promise.reject(failure)
          default:
            return Promise.resolve(profileTemplate(path.basename(filePath)))
        }
      },
      writeFile: async () => {
        throw new Error("write phase must not start")
      },
    }),
  )
  let settled = false
  void rendering.catch(() => {
    settled = true
  })

  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(readCalls).toBe(4)
  expect(settled).toBe(false)

  sibling.resolve(profileTemplate("Editable.ini"))
  await expectRejectionSatisfies(rendering, (error) => {
    expectTruthy(error instanceof Error)
    expect(error.message).toMatch(/read Etterna profile template.*Etterna\.xml/i)
    expect(error.cause).toBe(failure)
    return true
  })
})

test("waits for every rendered write to settle before reporting a contextual failure", async () => {
  const sibling = deferred<void>()
  const failure = new Error("exact Etterna.xml write failure")
  let writeCalls = 0
  const rendering = renderEtternaProfileTemplates(
    "profile",
    "Rebirth",
    validValues,
    dependencies({
      writeFile: (filePath) => {
        writeCalls += 1
        switch (path.basename(filePath)) {
          case "Editable.ini":
            return sibling.promise
          case "Etterna.xml":
            return Promise.reject(failure)
          case "playerConfig.lua":
            return Promise.resolve()
          default:
            throw new Error(`Unexpected rendered write ${filePath}`)
        }
      },
    }),
  )
  let settled = false
  void rendering.catch(() => {
    settled = true
  })

  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(writeCalls).toBe(3)
  expect(settled).toBe(false)

  sibling.resolve()
  await expectRejectionSatisfies(rendering, (error) => {
    expectTruthy(error instanceof Error)
    expect(error.message).toMatch(/write rendered Etterna profile file.*Etterna\.xml/i)
    expect(error.cause).toBe(failure)
    return true
  })
})

const validValues: EtternaProfileTemplateValues = {
  profileName: "A&B <Player>",
  guid: "0123456789abcdef",
  cmod: 888,
  isDownscroll: false,
  skinName: "Pink & Blue",
  hitPosition: -7,
  comboPosition: -20,
  judgementPosition: 4,
  receptorSize: 107,
  comboScale: 0.5,
}

function profileTemplate(fileName: string): string {
  switch (fileName) {
    case "Editable.ini":
      return `[Editable]\nDisplayName=\${profile_name}\n`
    case "Etterna.xml":
      return `<DisplayName>\${profile_name}</DisplayName>\n<Guid>\${guid}</Guid>\n<dance>C\${cmod}, \${is_downscroll} Overhead, \${skin_name}</dance>\n`
    case "Type.ini":
      return "[ListPosition]\nPriority=1\n"
    case "playerConfig.lua":
      return `return { ReceptorSize= \${receptor_size}, NoteFieldY= \${hit_position}, ComboY= \${combo_position}, JudgmentY= \${judgement_position}, JudgmentZoom= 0.35, ComboZoom= \${combo_zoom} }\n`
    default:
      throw new Error(`Unexpected profile template ${fileName}`)
  }
}

function dependencies(
  overrides: Partial<EtternaProfileTemplateRendererDependencies> = {},
): EtternaProfileTemplateRendererDependencies {
  return {
    readFile: async (filePath) => profileTemplate(path.basename(filePath)),
    writeFile: async () => {},
    mkdir: async () => {},
    rename: async () => {},
    ...overrides,
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function withProfileTemplate(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-render-"))
  try {
    await writeProfileTemplate(root)
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function writeProfileTemplate(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await Promise.all([
    writeFile(path.join(root, "Editable.ini"), `[Editable]\nDisplayName=\${profile_name}\n`),
    writeFile(
      path.join(root, "Etterna.xml"),
      `<DisplayName>\${profile_name}</DisplayName>\n<Guid>\${guid}</Guid>\n<dance>C\${cmod}, \${is_downscroll} Overhead, \${skin_name}</dance>\n`,
    ),
    writeFile(path.join(root, "Type.ini"), "[ListPosition]\nPriority=1\n"),
    writeFile(
      path.join(root, "playerConfig.lua"),
      `return { ReceptorSize= \${receptor_size}, NoteFieldY= \${hit_position}, ComboY= \${combo_position}, JudgmentY= \${judgement_position}, JudgmentZoom= 0.35, ComboZoom= \${combo_zoom} }\n`,
    ),
  ])
}
