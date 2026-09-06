import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const feedbackScript = path.join(projectRoot, ".ci", "quality", "git-hook-feedback.ts")

async function readFeedback(failure: string): Promise<string> {
  const { stderr } = await execFileAsync(process.execPath, [feedbackScript, failure], {
    cwd: projectRoot,
    encoding: "utf8",
  })
  return stderr
}

test("pre-commit feedback explains how to fix, validate, stage, and retry", async () => {
  const feedback = await readFeedback("pre-commit")

  expect(feedback).toMatch(/Commit blocked/)
  expect(feedback).toMatch(/pre-commit checks/)
  expect(feedback).toMatch(/npm run check:staged/)
  expect(feedback).toMatch(/git add <files>/)
  expect(feedback).toMatch(/git add path\/to\/fixed-file\.ts/)
  expect(feedback).toMatch(/git commit -m "fix: describe the correction"/)
})

test("Changeset feedback gives release and maintenance recovery examples", async () => {
  const feedback = await readFeedback("pre-push-changeset")

  expect(feedback).toMatch(/Push blocked/)
  expect(feedback).toMatch(/npm run changeset$/m)
  expect(feedback).toMatch(/npm run changeset -- --empty/)
  expect(feedback).toMatch(/git add \.changeset/)
})

test("quality feedback explains how to validate before retrying the push", async () => {
  const feedback = await readFeedback("pre-push-quality")

  expect(feedback).toMatch(/Push blocked/)
  expect(feedback).toMatch(/npm run check/)
  expect(feedback).toMatch(/git push/)
})
