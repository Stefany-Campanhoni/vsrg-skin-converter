import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { FileContentExpectation } from "../../../application/ports/file-content-expectation.ts"
import { type AstObject, asAstObject, getTableField } from "../../../infrastructure/lua/ast.ts"
import { parseLuaSource } from "../../../infrastructure/lua/parse-lua-source.ts"

export interface PreparedEtternaAssetsConfigUpdate {
  readonly content: string
  readonly expectation: FileContentExpectation
}

export interface PrepareEtternaAssetsConfigUpdateDependencies {
  readFile(filePath: string): Promise<Buffer>
}

export interface WriteEtternaAssetsConfigUpdateDependencies {
  writeFile(filePath: string, content: string, encoding: "utf8"): Promise<void>
}

const defaultPrepareDependencies: PrepareEtternaAssetsConfigUpdateDependencies = { readFile }
const defaultWriteDependencies: WriteEtternaAssetsConfigUpdateDependencies = { writeFile }
const etternaProfileGuidPattern = /^[0-9a-f]{16}$/

export async function prepareEtternaAssetsConfigUpdate(
  filePath: string,
  guid: string,
  judgementPath: string,
  dependencies: PrepareEtternaAssetsConfigUpdateDependencies = defaultPrepareDependencies,
): Promise<PreparedEtternaAssetsConfigUpdate> {
  assertEtternaProfileGuid(guid, filePath)
  const original = await readOptionalFile(filePath, dependencies)
  if (!original) {
    const content = `return { judgment = { [${encodeLuaString(guid)}] = ${encodeLuaString(judgementPath)} } }\n`
    validateRenderedSource(content, filePath)
    return { content, expectation: { state: "missing" } }
  }

  const source = original.toString("utf8")
  const root = readRootTable(source, filePath)
  const judgment = getTableField(root, "judgment")
  let insertionIndex: number
  let insertion: string
  if (judgment) {
    requireTable(judgment, "judgment", filePath)
    if (getTableField(judgment, guid)) {
      throw new Error(`Etterna profile GUID ${guid} already exists in ${filePath}`)
    }
    insertionIndex = getOpeningBraceIndex(judgment, source, filePath)
    insertion = `\n    [${encodeLuaString(guid)}] = ${encodeLuaString(judgementPath)},`
  } else {
    insertionIndex = getOpeningBraceIndex(root, source, filePath)
    insertion = `\n  judgment = { [${encodeLuaString(guid)}] = ${encodeLuaString(judgementPath)} },`
  }

  const content = source.slice(0, insertionIndex + 1) + insertion + source.slice(insertionIndex + 1)
  validateRenderedSource(content, filePath)
  return {
    content,
    expectation: {
      state: "sha256",
      sha256: createHash("sha256").update(original).digest("hex"),
    },
  }
}

export async function writeEtternaAssetsConfigUpdate(
  outputFile: string,
  update: PreparedEtternaAssetsConfigUpdate,
  dependencies: WriteEtternaAssetsConfigUpdateDependencies = defaultWriteDependencies,
): Promise<void> {
  try {
    await dependencies.writeFile(outputFile, update.content, "utf8")
  } catch (cause) {
    throw new Error(`Could not write Etterna asset configuration ${outputFile}`, { cause })
  }
}

async function readOptionalFile(
  filePath: string,
  dependencies: PrepareEtternaAssetsConfigUpdateDependencies,
): Promise<Buffer | undefined> {
  try {
    return await dependencies.readFile(filePath)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw new Error(`Could not read Etterna asset configuration ${filePath}`, { cause })
  }
}

function readRootTable(source: string, filePath: string): AstObject {
  let ast: ReturnType<typeof parseLuaSource>
  try {
    ast = parseLuaSource(source, { ranges: true })
  } catch (cause) {
    throw new Error(`Could not parse Etterna asset configuration ${filePath}`, { cause })
  }

  if (ast.body.length !== 1 || ast.body[0]?.type !== "ReturnStatement") {
    throw new Error(`Expected ${filePath} to contain one top-level return statement`)
  }
  const returnedValues = ast.body[0].arguments
  if (returnedValues.length !== 1) {
    throw new Error(`Expected ${filePath} to return exactly one Lua table`)
  }
  return requireTable(asAstObject(returnedValues[0]), "returned value", filePath)
}

function requireTable(value: AstObject | undefined, name: string, filePath: string): AstObject {
  if (value?.type !== "TableConstructorExpression") {
    throw new Error(`Expected ${name} to be a Lua table in ${filePath}`)
  }
  return value
}

function getOpeningBraceIndex(table: AstObject, source: string, filePath: string): number {
  const start = table.range?.[0]
  if (start === undefined || source[start] !== "{") {
    throw new Error(`Could not locate Lua table range in ${filePath}`)
  }
  return start
}

function validateRenderedSource(content: string, filePath: string): void {
  try {
    parseLuaSource(content, { ranges: true })
  } catch (cause) {
    throw new Error(`Could not render valid Etterna asset configuration ${filePath}`, { cause })
  }
}

function assertEtternaProfileGuid(guid: string, filePath: string): void {
  if (!etternaProfileGuidPattern.test(guid)) {
    throw new Error(`Invalid Etterna profile GUID ${JSON.stringify(guid)} for ${filePath}`)
  }
}

function encodeLuaString(value: string): string {
  const encoded = [...value]
    .map((character) =>
      character === '"' || character === "\\" || character.charCodeAt(0) < 32
        ? escapeLuaCharacter(character)
        : character,
    )
    .join("")
  return `"${encoded}"`
}

function escapeLuaCharacter(character: string): string {
  switch (character) {
    case '"':
      return '\\"'
    case "\\":
      return "\\\\"
    case "\n":
      return "\\n"
    case "\r":
      return "\\r"
    case "\t":
      return "\\t"
    default:
      return `\\${character.charCodeAt(0).toString(10).padStart(3, "0")}`
  }
}
