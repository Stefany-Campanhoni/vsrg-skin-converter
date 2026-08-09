# Game-Specific Template Directories

## Goal

Move the existing osu! output template bundle from `src/templates` to
`src/templates/osu` so future Etterna templates can live independently in
`src/templates/etterna`.

## Scope

- Move every current file under `src/templates` into `src/templates/osu` without
  changing file contents or relative paths inside the bundle.
- Update the production osu! template path constant to point to the new directory.
- Update tests that read the production template bundle directly.
- Update current project documentation that describes the template layout.
- Preserve temporary test fixtures named `templates`; those fixtures receive their
  directory explicitly and do not model the production repository layout.
- Preserve historical design and implementation documents as records of the paths
  that existed when those changes were designed.

## Architecture

`src/templates` is the root for output-game template bundles. Each output game owns
one child directory:

```text
src/templates/
  osu/
    skin.ini
    receptor-base.png
    LNB.png
    LNT.png
    ...
  etterna/             # added in a future change
```

The CLI continues to construct `OsuSkinWriter` with `osuTemplatesPath`. Only the
value of that configuration constant changes; writer APIs and conversion behavior
remain unchanged.

## Data Flow

1. The CLI resolves `src/templates/osu` through `osuTemplatesPath`.
2. `OsuSkinWriter` copies that directory into its transactional workspace.
3. Existing rendering, asset publication, and cleanup steps operate on the copied
   files exactly as before.

## Failure Behavior

Missing required osu! template files continue to fail through the existing writer
and filesystem behavior. The directory move does not introduce fallback paths or
implicit compatibility with the former `src/templates` location.

## Testing

- Change direct production-template tests to read `src/templates/osu/skin.ini` and
  verify that they fail before the bundle is moved.
- Run the focused template and writer tests after the move.
- Run the complete test, typecheck, lint, architecture, and diff checks.

## Non-Goals

- Creating the Etterna template bundle.
- Changing any template asset content.
- Changing output paths inside `skin.ini`.
- Refactoring writer contracts or conversion rules.
- Modifying the parallel `.tmp`, `src/scripts`, or `package.json` work.
