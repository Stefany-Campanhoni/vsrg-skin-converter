# osu! Skin Output Design

## Goal

Publish converted skins directly into the local osu! installation instead of the
repository-local `output_folder`.

## Destination

The CLI resolves the osu! skins root from the Windows `LOCALAPPDATA` environment
variable:

```text
%LOCALAPPDATA%/osu!/Skins
```

The conversion destination is the selected skin's source name:

```text
%LOCALAPPDATA%/osu!/Skins/<reference.name>
```

This is the same name placed in `skin.ini` by the existing writer.

## Safety and Behavior

The existing `TransactionalOutputPublisher` continues to build a temporary sibling and
replace only the named skin directory after a successful conversion. Other osu! skins
are never enumerated or changed. If `LOCALAPPDATA` is unavailable, destination
resolution throws an actionable error before conversion begins. The root must be absolute,
and the skin name must be one safe directory segment so the destination cannot escape the
osu! `Skins` directory.

## Tests

Tests cover environment-root resolution, skin-name joining, missing or relative
`LOCALAPPDATA`, and unsafe skin-name segments. Existing publisher tests continue to verify
transactional replacement behavior.
