import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import path from "node:path"
import test from "node:test"
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

  assert.match(feedback, /Commit blocked/)
  assert.match(feedback, /pre-commit checks/)
  assert.match(feedback, /npm run check:staged/)
  assert.match(feedback, /git add <files>/)
  assert.match(feedback, /git add path\/to\/fixed-file\.ts/)
  assert.match(feedback, /git commit -m "fix: describe the correction"/)
})

test("Changeset feedback gives release and maintenance recovery examples", async () => {
  const feedback = await readFeedback("pre-push-changeset")

  assert.match(feedback, /Push blocked/)
  assert.match(feedback, /npm run changeset$/m)
  assert.match(feedback, /npm run changeset -- --empty/)
  assert.match(feedback, /git add \.changeset/)
})

test("quality feedback explains how to validate before retrying the push", async () => {
  const feedback = await readFeedback("pre-push-quality")

  assert.match(feedback, /Push blocked/)
  assert.match(feedback, /npm run check/)
  assert.match(feedback, /git push/)
})
