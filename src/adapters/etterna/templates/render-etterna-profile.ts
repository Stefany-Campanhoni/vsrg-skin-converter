import {
  mkdir as createDirectory,
  rename as moveFile,
  readFile as readTextFile,
  writeFile as writeTextFile,
} from "node:fs/promises"
import path from "node:path"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"

export interface EtternaProfileTemplateValues {
  readonly profileName: string
  readonly guid: string
  readonly hitPosition: number
  readonly comboPosition: number
  readonly judgementPosition: number
  readonly receptorSize: number
}

export interface EtternaProfileTemplateRendererDependencies {
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, contents: string): Promise<void>
  mkdir(directoryPath: string): Promise<void>
  rename(sourcePath: string, destinationPath: string): Promise<void>
}

const defaultDependencies: EtternaProfileTemplateRendererDependencies = {
  readFile: (filePath) => readTextFile(filePath, "utf8"),
  writeFile: async (filePath, contents) => {
    await writeTextFile(filePath, contents, "utf8")
  },
  mkdir: async (directoryPath) => {
    await createDirectory(directoryPath, { recursive: true })
  },
  rename: moveFile,
}

const wildcardPattern = /\$\{([^}]*)\}/g

export async function renderEtternaProfileTemplates(
  profileDirectory: string,
  theme: string,
  values: EtternaProfileTemplateValues,
  dependencies: EtternaProfileTemplateRendererDependencies = defaultDependencies,
): Promise<void> {
  validateValues(theme, values)

  const editablePath = path.join(profileDirectory, "Editable.ini")
  const xmlPath = path.join(profileDirectory, "Etterna.xml")
  const typePath = path.join(profileDirectory, "Type.ini")
  const playerConfigPath = path.join(profileDirectory, "playerConfig.lua")
  const [editableTemplate, xmlTemplate, typeTemplate, playerConfigTemplate] = await settleAll([
    runFileOperation("read Etterna profile template", editablePath, () =>
      dependencies.readFile(editablePath),
    ),
    runFileOperation("read Etterna profile template", xmlPath, () =>
      dependencies.readFile(xmlPath),
    ),
    runFileOperation("read Etterna profile template", typePath, () =>
      dependencies.readFile(typePath),
    ),
    runFileOperation("read Etterna profile template", playerConfigPath, () =>
      dependencies.readFile(playerConfigPath),
    ),
  ])

  const editable = renderOwnedTemplate("Editable.ini", editableTemplate, {
    profile_name: values.profileName,
  })
  const xml = renderOwnedTemplate("Etterna.xml", xmlTemplate, {
    profile_name: escapeXmlText(values.profileName),
    guid: values.guid,
  })
  renderOwnedTemplate("Type.ini", typeTemplate, {})
  const playerConfig = renderOwnedTemplate("playerConfig.lua", playerConfigTemplate, {
    hit_position: values.hitPosition,
    combo_position: values.comboPosition,
    judgement_position: values.judgementPosition,
    receptor_size: values.receptorSize,
  })

  await settleAll([
    runFileOperation("write rendered Etterna profile file", editablePath, () =>
      dependencies.writeFile(editablePath, editable),
    ),
    runFileOperation("write rendered Etterna profile file", xmlPath, () =>
      dependencies.writeFile(xmlPath, xml),
    ),
    runFileOperation("write rendered Etterna profile file", playerConfigPath, () =>
      dependencies.writeFile(playerConfigPath, playerConfig),
    ),
  ])
  const settingsDirectory = path.join(profileDirectory, `${theme}_settings`)
  await runFileOperation("create Etterna theme settings directory", settingsDirectory, () =>
    dependencies.mkdir(settingsDirectory),
  )
  const installedPlayerConfigPath = path.join(settingsDirectory, "playerConfig.lua")
  await runFileOperation(
    "move rendered Etterna player configuration",
    `${playerConfigPath} -> ${installedPlayerConfigPath}`,
    () => dependencies.rename(playerConfigPath, installedPlayerConfigPath),
  )
}

async function runFileOperation<T>(
  operation: string,
  filePath: string,
  task: () => T | PromiseLike<T>,
): Promise<T> {
  try {
    return await invokeAsPromise(task)
  } catch (cause) {
    throw new Error(`Could not ${operation} ${filePath}`, { cause })
  }
}

function validateValues(theme: string, values: EtternaProfileTemplateValues): void {
  if (/[\r\n]/.test(values.profileName)) {
    throw new Error("Etterna profile name cannot contain a line break")
  }
  if (!/^[0-9a-f]{16}$/.test(values.guid)) {
    throw new Error("Etterna GUID must contain exactly 16 lowercase hexadecimal characters")
  }
  assertSafeTheme(theme)
  for (const [field, value] of Object.entries({
    hitPosition: values.hitPosition,
    comboPosition: values.comboPosition,
    judgementPosition: values.judgementPosition,
    receptorSize: values.receptorSize,
  })) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Etterna profile requires a finite ${field}`)
    }
  }
}

function assertSafeTheme(theme: string): void {
  const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
  if (
    theme.trim().length === 0 ||
    theme === "." ||
    theme === ".." ||
    path.isAbsolute(theme) ||
    hasUnsafeThemeCharacter(theme) ||
    /[. ]$/.test(theme) ||
    reservedWindowsName.test(theme)
  ) {
    throw new Error(`Unsafe Etterna theme: ${JSON.stringify(theme)}`)
  }
}

function hasUnsafeThemeCharacter(theme: string): boolean {
  return [...theme].some(
    (character) => character.charCodeAt(0) <= 0x1f || '<>:"/\\|?*'.includes(character),
  )
}

function renderOwnedTemplate(
  fileName: string,
  template: string,
  replacements: Readonly<Record<string, string | number>>,
): string {
  const wildcards = [...template.matchAll(wildcardPattern)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  )
  for (const key of Object.keys(replacements)) {
    const count = wildcards.filter((wildcard) => wildcard === key).length
    if (count !== 1) {
      throw new Error(`Expected exactly one \${${key}} wildcard in ${fileName}; found ${count}`)
    }
  }
  for (const wildcard of wildcards) {
    if (!Object.hasOwn(replacements, wildcard)) {
      throw new Error(`Unresolved wildcard \${${wildcard}} in ${fileName}`)
    }
  }

  return template.replace(wildcardPattern, (wildcard, key: string) => {
    if (!Object.hasOwn(replacements, key)) {
      throw new Error(`Unresolved wildcard ${wildcard} in ${fileName}`)
    }
    return String(replacements[key])
  })
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}
