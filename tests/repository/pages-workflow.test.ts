import { expect, test } from "bun:test"

test("Pages builds PRs without deployment privilege and deploys only main with pinned actions", async () => {
  const yaml = await Bun.file(".github/workflows/pages.yml").text()
  expect(yaml).toContain("pull_request:")
  expect(yaml).toContain("build:")
  expect(yaml).toContain("deploy:")
  expect(yaml).toContain("github.ref == 'refs/heads/main'")
  expect(yaml).toContain("environment:")
  expect(yaml).toContain("name: github-pages")
  expect(yaml).toContain("path: build/web")
  expect(yaml.indexOf("pages: write")).toBeGreaterThan(yaml.indexOf("deploy:"))
  expect(yaml.indexOf("id-token: write")).toBeGreaterThan(yaml.indexOf("deploy:"))
  for (const action of yaml.matchAll(/uses: ([^\s]+)/g)) expect(action[1]).toMatch(/@[a-f0-9]{40}$/)
  expect(yaml).toContain("bun run check")
  expect(yaml).toContain("bun run test:browser")
  expect(yaml).toContain("bun run build:web")
})
