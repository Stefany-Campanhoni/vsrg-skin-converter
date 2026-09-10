import { expect, onTestFinished, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { assertPhysicallyControlledReleasePath } from "../../.ci/release/controlled-release-path.ts"

test("rejects a junction ancestor that redirects a mutation outside the controlled root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-controlled-path-test-"))
  onTestFinished(() => rm(root, { recursive: true }))
  const controlledRoot = path.join(root, "controlled")
  const outsideRoot = path.join(root, "outside")
  await mkdir(controlledRoot)
  await mkdir(outsideRoot)
  const alias = path.join(controlledRoot, "alias")
  try {
    await symlink(outsideRoot, alias, "junction")
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "EPERM" || error.code === "EACCES" || error.code === "ENOSYS")
    ) {
      return
    }
    throw error
  }

  await expect(
    assertPhysicallyControlledReleasePath(
      controlledRoot,
      path.join(alias, "victim"),
      "test mutation path",
    ),
  ).rejects.toThrow(/symbolic link|junction/i)
})
