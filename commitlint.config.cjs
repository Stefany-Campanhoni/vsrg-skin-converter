module.exports = {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: true,
  rules: {
    "header-max-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "refactor",
        "docs",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
        "deps",
      ],
    ],
  },
}
