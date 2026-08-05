# Etterna Profile Selection Design

## Goal

Allow the CLI to use any Etterna local profile instead of always reading profile
`00000000`. The selected profile must determine both the playfield configuration and
the judgement asset selection.

## Discovery

The Etterna adapter will discover immediate profile directories in:

```text
<gameRoot>/Save/LocalProfiles
```

Each profile is represented by its directory name and the display name read from its
`Etterna.xml` file. The XML `DisplayName` element is trimmed before use. A missing or
empty element produces the display name `unknown`.

Discovery returns profiles in deterministic directory-name order. If `LocalProfiles`
contains no profile directories, discovery throws an actionable error.

## CLI Flow

After the source game folder is validated, the CLI discovers local Etterna profiles.

- With one profile, it is selected automatically.
- With multiple profiles, the CLI calls the existing `askSelect` component, displaying
  each profile's `DisplayName` as its label and using its directory ID as its value.
- Cancelling this prompt ends the CLI in the same way as cancelling game or skin
  selection.

The profile prompt is placed before skin selection because it is source-game setup,
and its selected ID configures all profile-dependent Etterna reads.

## Profile-Dependent Reads

`EtternaSkinReader` will receive the selected profile ID at construction. It passes
that ID to both profile configuration and judgement analysis dependencies. Those
adapters resolve files relative to the selected local-profile directory rather than a
hard-coded default profile.

The profile identifier remains an Etterna adapter concern; it is not added to the
game-neutral `SkinReference` or `SkinModel` types.

## Errors and Tests

Filesystem/XML read failures retain context from the path being read. Tests cover:

- profile discovery, including deterministic ordering;
- `DisplayName` extraction and the `unknown` fallback;
- failure when no profile directories exist;
- use of a non-default profile for both playfield configuration and judgement GUID.

