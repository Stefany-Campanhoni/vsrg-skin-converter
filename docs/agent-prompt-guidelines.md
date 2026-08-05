# Agent Prompt Guidelines

Use these guidelines when asking an agent to change the converter. They make behavior,
ownership, failure semantics, and verification explicit enough to avoid accidental
regressions.

## Information Every Implementation Prompt Should Include

### Scope and workspace state

- Name the conversion route being changed, currently Etterna to osu!mania.
- List the files or responsibilities believed to be involved without forcing an incorrect
  implementation location.
- State whether existing uncommitted changes must be preserved.
- State explicitly whether staging, committing, or publishing is allowed.

### Observable behavior

- Describe inputs, outputs, thresholds, rounding rules, filenames, and fallback behavior.
- State the order of image transformations when order affects geometry.
- Include examples on both sides of every boundary, such as widths below, equal to, and above
  150 pixels.
- Distinguish a valid empty asset from an invalid or unreadable asset.

### Responsibility boundaries

- Put generic filesystem, image, and language mechanisms in `src/infrastructure`.
- Put Etterna interpretation in `src/adapters/etterna`.
- Put osu! filenames and fallback policy in `src/adapters/osu`.
- Put source-to-target equivalences in `src/conversions/etterna-to-osu`.
- Keep empirical target calibration in the target adapter's calibration module.
- Keep runtime paths in `src/config`, but keep the exact target asset inventory in its
  writer. Do not make a writer discover filenames from the repository's global template at
  module initialization.

### Failure and concurrency contract

- Say whether a failure is recoverable or must abort the conversion.
- Require contextual errors with the original `cause` for lower-level failures.
- Require every started sibling operation to settle before a batch rejects.
- Require injected or replaceable callbacks to use `invokeAsPromise` so synchronous throws
  cannot prevent later siblings from starting.
- State whether any output may be published after preparation fails.

### Evidence and compatibility

- Require a failing test before production behavior changes.
- Require valid generated PNG fixtures for normal image tests.
- Ask for boundary, failure, and quiescence tests, not only happy-path tests.
- Name representative real skins in `tmp` for the compatibility audit when known.
- Require the complete verification suite from `docs/development-standards.md`.
- Treat dated plans and specs as historical records; current architecture, standards, and
  approved follow-up calibrations take precedence when they differ.
- When changing a template prefix or asset inventory, update `skin.ini`, the owning writer,
  isolated writer fixtures, and the end-to-end output assertions together.

## Receptor-Specific Invariants

- Frame extraction happens before rotation.
- Width normalization happens after rotation and before target vertical scaling.
- A receptor narrower than 150 pixels is enlarged proportionally to exactly 150 pixels wide.
- A receptor at least 150 pixels wide fits within a 150-by-150 boundary without enlargement.
- Target vertical scaling changes height after normalization.
- Trailing transparent rows are removed before the final transparent footer is applied.
- A transparent normal receptor remains transparent.
- A transparent pressed receptor uses the rendered normal receptor from the same direction.
- An unreadable rendered buffer aborts with direction and state context; it is not a fallback.
- The eight osu! receptor filenames use `@2x`, including pressed `_tap` variants.

## Prompt Template

```text
Implement [behavior] for the [source] -> [target] conversion.

Workspace constraints:
- Preserve all current uncommitted changes.
- Do not stage or commit unless I explicitly approve it.

Behavior contract:
- Input: [source value/assets and where they are read].
- Output: [target value/assets and exact filenames/paths].
- Boundaries: [minimum/default/maximum examples and rounding].
- Transformation order: [ordered image or data operations].
- Fallback: [valid empty/missing behavior].
- Fatal failures: [invalid input or processing failures].

Architecture:
- Keep generic mechanisms in infrastructure.
- Keep source parsing in the source adapter.
- Keep target policy and filenames in the target adapter.
- Keep conversion equivalences in the conversion module.

Concurrency and publication:
- Wait for all started sibling tasks before rejecting.
- Convert synchronous injected-callback throws into settled rejections.
- Do not write output when preparation fails.

Verification:
- Add a failing regression test first and prove it detects the broken behavior.
- Use valid generated image buffers except in decoder-failure tests.
- Cover happy path, boundaries, fallback, failure context, and quiescence.
- Audit [representative tmp skins].
- Run test, typecheck, lint, architecture, and diff-check gates.

Report the changed files, behavior, audit corpus, and exact verification results.
```

## Review Prompt Template

```text
Review the current unstaged diff against docs/development-standards.md and the approved
behavior contract. Do not assume passing tests prove concurrency or failure semantics.

Check specifically:
- responsibility placement and dependency direction;
- transformation order and boundary behavior;
- valid empty assets versus corrupt inputs;
- nested async quiescence and synchronous callback throws;
- contextual errors that preserve cause;
- realistic fixtures and compatibility coverage in tmp;
- unintended changes to existing user work.

Fix every confirmed issue, keep the work unstaged and uncommitted, run all verification
gates, and report remaining risks explicitly.
```
