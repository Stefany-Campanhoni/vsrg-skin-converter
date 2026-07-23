# osu! Long-Note Template Assets Design

**Date:** 2026-07-23

## Goal

Publish the fixed long-note body and tail assets supplied by the osu! template without
resizing, rendering, or otherwise transforming their contents. Remove internal template
artifacts from the generated skin before the writer finishes.

This phase applies only to Etterna-to-osu! conversion and does not read long-note assets
from the Etterna source skin.

## Asset Mapping

The template assets use internal source names and are copied to the paths referenced by
`skin.ini`:

| Template asset | Generated asset |
| --- | --- |
| `LNB.png` | `mania/lns/body.png` |
| `LNT.png` | `mania/lns/tail.png` |

All four mania columns continue to share these two files through the existing
`NoteImage0L` through `NoteImage3L` and `NoteImage0T` through `NoteImage3T` properties.

The copy is byte-for-byte. The image infrastructure and Sharp are not involved.

## Architecture

### Long-note publisher

A focused osu! writer module publishes the long-note template assets. It receives the
copied workspace directory, creates `mania/lns`, and copies the two source files to their
final names.

The module owns the explicit source-to-destination mapping. This keeps fixed osu! template
knowledge out of the domain, conversion service, and generic filesystem infrastructure.

### Writer orchestration

`OsuSkinWriter` retains the existing initial copy of the complete template directory. It
then runs receptor rendering, tap-note rendering, and long-note publication as independent
workspace build tasks.

Cleanup starts only after all build tasks finish successfully. Therefore, the receptor base
remains available throughout receptor rendering, and the root long-note files remain
available throughout long-note publication.

### Template-artifact cleanup

A focused finalization step removes only these known internal artifacts from the workspace
root:

- `receptor-base.png`
- `LNB.png`
- `LNT.png`

The artifact names are held in one named constant rather than repeated inline. Cleanup does
not scan the workspace, infer disposable files, or remove any generated skin assets.

## Data Flow

1. Copy the entire template directory into the staged output workspace.
2. Render `skin.ini`.
3. In parallel:
   - render receptors;
   - render tap notes;
   - copy `LNB.png` to `mania/lns/body.png`;
   - copy `LNT.png` to `mania/lns/tail.png`.
4. Wait for every build task to succeed.
5. Remove the three known internal template artifacts from the workspace root.
6. Return control to the existing publication orchestration.

## Error Handling

Missing or unreadable `LNB.png` or `LNT.png` fails the workspace build. Cleanup does not run
after a build-task failure, so it cannot hide the original error or remove files still
needed for diagnosis.

The existing staged publication boundary remains authoritative: a failed workspace build
does not replace the previously published output.

Cleanup uses exact resolved child paths under the workspace and does not accept arbitrary
targets. A cleanup failure fails the workspace build rather than publishing internal
artifacts.

## Testing

### Long-note publisher tests

- Copy both fixtures to `mania/lns/body.png` and `mania/lns/tail.png`.
- Verify the destination bytes exactly match their corresponding source bytes.
- Verify the destination directory is created.
- Verify a missing source asset rejects the operation.

### osu! writer tests

- Verify the complete workspace contains the final body and tail assets.
- Verify `receptor-base.png`, `LNB.png`, and `LNT.png` are absent after success.
- Verify generated receptors and tap notes remain present.
- Verify a long-note copy failure rejects the build.

### Integration test

- Verify the Etterna-to-osu! output contains the two final long-note paths.
- Verify their bytes exactly match the template assets.
- Verify none of the three internal template artifacts remain at the output root.

## Non-Goals

- Extracting or converting Etterna long-note graphics.
- Per-column long-note images.
- Resizing, recoloring, rotating, or recompressing the supplied PNG files.
- General-purpose template asset manifests.
- Broad output-directory cleanup based on filename patterns.
