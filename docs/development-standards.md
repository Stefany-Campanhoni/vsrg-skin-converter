# Development Standards

These rules are mandatory for production code, tests, documentation, and agent-authored
changes.

## Placement

Place code with the responsibility that owns it:

- universal vocabulary and invariants: `src/domain`;
- use-case coordination and interfaces: `src/application`;
- one game's parsing or output conventions: `src/adapters/<game>`;
- cross-game equivalences: `src/conversions/<source>-to-<target>`;
- technical filesystem, image, or language mechanisms: `src/infrastructure`;
- runtime defaults and composition paths: `src/config`;
- command-line interaction and wiring: `src/cli`;
- cross-layer integration tests: `tests/integration`;
- dependency enforcement: `tests/architecture`.

Do not create generic dumping grounds named `utils`, `helpers`, `common`, `objects`, or
`constants`. If a module has no clear owner, identify the responsibility before adding it.

Constants stay with their owner. For example, an osu! output filename belongs to the osu!
adapter, while an Etterna-to-osu! coordinate equivalence belongs to that conversion.

## Naming and Modules

- Files and directories use `kebab-case`.
- Types, interfaces, and classes use `PascalCase`.
- Functions, variables, and constants use `camelCase`.
- Use named exports; do not add default exports.
- Use `import type` for type-only dependencies.
- Prefer readonly data, `as const` tuples, and derived union types over enums.
- Keep a module focused and keep implementation details private.
- Add a barrel file only when a package deliberately exposes a stable public surface.

Technical identifiers, filenames, diagnostics, errors, comments, and documentation are
written in English.

## Dependencies

Respect the direction documented in [architecture.md](./architecture.md). Do not bypass an
application port by importing a concrete adapter into the application layer. Do not place
format-specific knowledge in the domain or shared infrastructure.

Run `npm run test:architecture` whenever imports or module placement change.

## Errors and Diagnostics

Throw an error when the conversion cannot produce a valid complete target. Wrap lower-level
failures with actionable context and preserve the original error with `cause`.

Use `Diagnostic` for recoverable findings. Diagnostics must have a stable code, severity,
responsible component, optional direction, and useful message. Libraries and adapters do
not print errors or diagnostics; only the CLI presents them.

Never catch a filesystem or image-processing error only to log it and continue.

## Comments

Prefer descriptive names and small functions. Add a comment only when it explains:

- a non-obvious invariant;
- an external format constraint;
- a safety boundary;
- why an apparently simpler implementation is incorrect.

Do not narrate what the following code already states.

## Testing

- Colocate unit tests as `*.test.ts`.
- Put cross-module behavior in `tests/integration`.
- Put dependency rules in `tests/architecture`.
- Use small generated fixtures for deterministic tests.
- Keep real skins under `tmp` as a compatibility-audit corpus, not as unit-test fixtures.
- For a behavior change, write or update a failing test before production code.
- Test public outcomes and important failure behavior, not private implementation details.

Every completed change must pass:

```sh
npm test
npm run typecheck
npm run lint
npm run test:architecture
git diff --check
```

Changes to Etterna analysis or image conversion also require a compatibility audit against
the applicable real skins under `tmp`.

## Output and Safety

The target writer builds a complete workspace. Publication replaces `output_folder` in full
through `TransactionalOutputPublisher`; writers must not depend on files from an earlier
conversion.

Never execute skin-provided Lua. Use the static AST and conservative resolution rules. An
unsupported construct should produce a diagnostic or contextual failure according to
whether a valid target can still be generated.

Do not weaken target-path validation or replace transactional publication with direct
recursive deletion.
