import { expect, test } from "bun:test"
import path from "node:path"
import { runCapturedSubprocess } from "../../.ci/runtime/run-subprocess.ts"

const projectRoot = Bun.fileURLToPath(new URL("../../", import.meta.url))
const feedbackScript = path.join(projectRoot, ".ci", "quality", "git-hook-feedback.ts")

async function readFeedback(failure: string): Promise<string> {
  const executable = Bun.argv[0]
  if (!executable) throw new Error("Could not determine the Bun executable")
  const result = await runCapturedSubprocess([executable, feedbackScript, failure], {
    cwd: projectRoot,
  })
  if (result.code !== 0) {
    throw new Error(`Feedback script exited with code ${result.code}: ${result.stderr}`)
  }
  return result.stderr
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
