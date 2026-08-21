const feedbackByFailure = {
  "pre-commit": `
Commit blocked: the pre-commit checks did not pass.

How to continue:
  1. Fix the errors shown above.
  2. Run the pre-commit checks again: npm run check:staged
  3. Stage the fixes: git add <files>
  4. Retry the commit.

Example:
  git add path/to/fixed-file.ts
  git commit -m "fix: describe the correction"
`,
  "pre-push-changeset": `
Push blocked while checking the required release intent.

If the error above reports a missing Changeset, choose one command:
  Public application change:
    npm run changeset
  Maintenance-only change:
    npm run changeset -- --empty

Then commit the generated file and retry:
  git add .changeset
  git commit -m "chore: add release intent"
  git push
`,
  "pre-push-quality": `
Push blocked: the complete quality gate did not pass.

How to continue:
  1. Fix the errors shown above.
  2. Run the complete gate again: npm run check
  3. Retry: git push
`,
} as const

type HookFailure = keyof typeof feedbackByFailure

function isHookFailure(value: string): value is HookFailure {
  return Object.hasOwn(feedbackByFailure, value)
}

const failure = process.argv[2]
if (!failure || !isHookFailure(failure)) {
  throw new Error("Usage: git-hook-feedback.ts <pre-commit|pre-push-changeset|pre-push-quality>")
}

process.stderr.write(feedbackByFailure[failure])
