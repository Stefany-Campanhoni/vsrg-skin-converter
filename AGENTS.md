# Agent Guide

This file is the entry point for agents working on VSRG Skin Converter. Read the relevant
canonical documents before changing the project, and update them whenever a change affects
their contract. Keep this file as a concise index and working agreement, not a duplicate of
the detailed project rules.

- [Project overview, setup, and usage](readme.md)
- [Contribution and pull request workflow](CONTRIBUTING.md)
- [Architecture and dependency boundaries](docs/architecture.md)
- [Development, testing, and release standards](docs/development-standards.md)
- [Security policy and private reporting](SECURITY.md)

## Working agreement

- Prefer the smallest solution that satisfies the requested behavior and fits the existing
  architecture. Do not introduce speculative abstractions or opportunistic refactors.
- Never use TypeScript `any`, including in tests. Use explicit types or `unknown` with proper
  narrowing.
- Follow test-driven development for production changes: write a failing test first, make the
  smallest change that passes, then refactor while keeping the test suite green.
- Make behavior, boundaries, failures, authorization, and required evidence explicit.
- Respect the ownership, dependency, transactional, concurrency, and verification rules in
  the canonical architecture and development standards documents.

Every PR-bound development task must add a `.changeset/*.md` release intent artifact. Use an
empty Changeset only for maintenance with no public release impact, and use a Conventional
Commit pull request title. Automated pull requests authored by `dependabot[bot]` are exempt
from the Changeset requirement.
