# Hit Position Conversion and skin.ini Rendering

## Goal

Convert an Etterna skin's hit position to osu! using the defaults in `src/templates/basis.ts`,
then replace known wildcards in the copied osu! `skin.ini`
without modifying the source template or removing unresolved wildcards.

## Scope

This change covers only the Etterna-to-osu! conversion flow currently orchestrated by
`EtternaEngine.convertSkin`. Conversion in the opposite direction and conversions involving
other games are outside the current scope.

The initial replacements are:

- `${skin_name}`: the Etterna skin directory name, preserved exactly.
- `${hit_position}`: the converted and rounded osu! hit position.

Other wildcards remain unchanged until an equivalent value is implemented.

## Architecture

### Hit position conversion

`src/transform/hitposition.ts` owns the pure Etterna-to-osu! coordinate conversion. It uses both
defaults from `gamesDefault` rather than a hardcoded offset:

```ts
Math.round(
  value -
    gamesDefault.etterna.hitposition +
    gamesDefault.osu.hitposition,
)
```

This preserves the relative offset from the source game's default and applies it to the target
game's default. For example, Etterna `-6` becomes osu! `432`.

### Wildcard rendering

`src/utils/template.ts` owns template rendering through two responsibilities:

- `replaceWildcards(content, replacements)` performs pure string substitution.
- `renderTemplateFile(filePath, replacements)` reads and overwrites an existing copied file.

Replacement values may be strings or numbers. A replacement is applied when its key exists,
including values such as `0` and an empty string. A wildcard whose key is absent remains unchanged.

### Orchestration

The existing engine orchestration remains responsible for copying template assets into the output
directory. The renderer does not copy files.

After the copy and profile-coordinate extraction, `EtternaEngine.convertSkin`:

1. Converts `skinPositions.hitPosition` from Etterna to osu!.
2. Builds replacements from `skin.name` and the converted hit position.
3. Renders only `output_folder/skin.ini` in place.

`src/templates/skin.ini` is never written during conversion.

## Error handling

Missing wildcard values are not errors; their placeholders remain in the output.

Filesystem read or write failures from rendering propagate with the target file path in the error
message. This prevents a conversion from appearing successful when the copied `skin.ini` could not
be updated.

## Testing

Unit tests for hit position conversion cover:

- Etterna to osu!.
- Fractional results rounded to the nearest integer.

Unit tests for wildcard substitution cover:

- String, number, zero, and empty-string values.
- Multiple occurrences of the same wildcard.
- Unknown wildcards remaining unchanged.

A filesystem test uses temporary source and output files to confirm that rendering changes only
the copied output `skin.ini` and leaves the source template unchanged.

No test writes to the repository's real `src/templates/skin.ini` or `output_folder`.
