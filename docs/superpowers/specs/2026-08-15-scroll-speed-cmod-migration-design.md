# Scroll Speed and CMod Migration Design

## Purpose

Migrate the active scroll speed in both supported conversion directions:

- osu!mania `ManiaSpeed` becomes an Etterna CMod in the generated local profile;
- the selected Etterna profile's CMod becomes `ManiaSpeed` in the current Windows user's
  osu! configuration.

The change also migrates the osu!mania 4K scroll direction into the generated Etterna
profile. It does not migrate Etterna scroll direction back into osu!mania.

## Source Selection

### osu! to Etterna

The route keeps its existing osu! user-configuration selection behavior. One discovered
`osu!.*.cfg` is selected automatically, while multiple configurations are presented by
their `Username`. The selected configuration supplies display density and the integer
`ManiaSpeed` value.

The selected skin's single 4K `[Mania]` section supplies `UpsideDown`:

- `UpsideDown: 1` means downscroll;
- `UpsideDown: 0` or an absent property means upscroll;
- any other value is invalid.

### Etterna to osu!

The selected Etterna profile's `Etterna.xml` supplies one positive integer CMod from the
`<dance>` value below `<DefaultModifiers>`, such as `C888`. Matching is case-insensitive,
but the generated Etterna form uses uppercase `C`.

The target osu! CFG is not selected through a prompt. When the converted result is ready to
be installed, the target adapter uses the current Windows username to find the immediate,
case-insensitive filename `osu!.<Windows username>.cfg` below the resolved osu! installation
root. If that file cannot be opened because it does not exist, the operation fails with an
actionable message telling the user to start osu! at least once. This missing-target error
belongs only to Etterna-to-osu! installation; it does not replace the existing CFG selection
in the opposite route.

## Domain Data and Boundaries

`PlayfieldConfiguration` gains a finite numeric `scrollSpeed` and an optional
`isDownscroll` value. The numeric unit is identified by `SkinModel.game`, just as existing
playfield coordinates are source- or target-game values until the direction-specific
conversion maps them:

- an osu! model carries integer `ManiaSpeed`;
- an Etterna model carries integer CMod.

The osu! configuration adapter owns CFG parsing and target CFG rewriting. The osu! skin INI
adapter owns `UpsideDown`. The Etterna profile adapter owns CMod extraction from
`Etterna.xml` and rendering into that XML. Direction-specific conversion modules own the
equivalence formulas. The CLI only resolves installations, supplies the Windows username,
and composes adapters.

## Conversion Rules

### osu!mania to Etterna

The conversion first maps osu! column width to the target Etterna `ReceptorSize`, then uses
that converted receptor size in the supplied formula:

```text
inaccurateFix = receptorSize > 100
receptorScale = receptorSize / 100
cmod = (435.59 * maniaSpeed) / 13.72
if inaccurateFix: cmod += 35
result = round(cmod / receptorScale)
```

`maniaSpeed` and `receptorSize` must be positive finite values. The result is an integer.

### Etterna to osu!mania

The conversion preserves the behavior of the supplied `etternaToOsu` and
`convertCmodToScrollSpeed` functions without recursive implementation:

```text
candidate = roundToTwoDecimals((435 * cmod) / 13720)
candidateCmod = osuToEtterna(candidate, receptorSize)
while candidateCmod < cmod:
    candidate += 1
    candidateCmod = osuToEtterna(candidate, receptorSize)
result = round(candidate)
```

The receptor size is the selected Etterna profile's source `ReceptorSize`, before it is
converted to osu! column width. For example, `C888` with `ReceptorSize = 108` produces the
script's `29.16` candidate and writes the required integer `ManiaSpeed = 29`.

Both directions reject non-finite or non-positive inputs instead of relying on the reference
script's default receptor fallback. This keeps invalid profile data from producing a
plausible but unrelated speed.

## Target Rendering and Publication

### Generated Etterna profile

The owned `Etterna.xml` template renders these values:

- `${cmod}`: converted positive integer CMod;
- `${is_downscroll}`: an empty string for `UpsideDown: 1`, otherwise `Reverse,`;
- `${skin_name}`: the generated NoteSkin directory name, escaped as XML text.

The speed modifier is rendered with uppercase `C`. A normal upscroll result follows the
shape `<dance>C888, Reverse, Overhead, Skin Name</dance>`. A downscroll result contains no
`Reverse` modifier. Existing profile fields and the template's remaining modifiers stay
unchanged.

### Updated osu! configuration

The target CFG updater replaces the existing `ManiaSpeed` assignment with the converted
integer while preserving every unrelated byte-level line choice as far as text rewriting
allows, including line-ending style and surrounding property formatting. An absent
`ManiaSpeed` assignment is a contextual error; the updater does not invent a new location
for it.

Etterna-to-osu! changes from single-directory publication to an osu! installer backed by
`OutputSetPublisher`. The generated skin directory and the updated CFG file are staged and
published as one transaction. The CFG update records the original content SHA-256 and
aborts if the live file changes before publication. Any promotion failure rolls both targets
back, so users never receive a new skin with stale speed or a new speed with a stale skin.

The existing overwrite behavior for the named osu! skin remains unchanged.

## Errors

Fatal errors include the responsible file path and preserve lower-level causes when
applicable:

- missing, non-integer, or non-positive source `ManiaSpeed`;
- an invalid present 4K `UpsideDown` value;
- missing, duplicated, non-integer, or non-positive CMod in the selected profile;
- unavailable current Windows username;
- missing current user's target CFG, with guidance to start osu! at least once;
- missing target `ManiaSpeed` assignment;
- concurrent target CFG modification;
- transactional staging, publication, or rollback failure.

No target is published when source parsing or conversion fails.

## Testing

Unit tests cover:

- CFG parsing of integer `ManiaSpeed` and rejection of missing, fractional, non-positive,
  and non-numeric values;
- 4K `UpsideDown` behavior for `1`, `0`, absence, and invalid values;
- Etterna CMod extraction from the selected profile and malformed or ambiguous XML content;
- both conversion formulas, the `ReceptorSize > 100` correction, termination of the
  iterative search, and final integer rounding including `C888`/`108` to `29`;
- profile-template rendering for CMod, direction, XML-escaped skin name, and uppercase `C`;
- case-insensitive current-user CFG discovery, exact `ManiaSpeed` replacement, missing-file
  guidance, missing-property failure, formatting preservation, and concurrent-change guard;
- osu! installer transaction membership and rollback behavior;
- route wiring without adding a target CFG prompt.

Both integration suites are extended. osu!-to-Etterna asserts the selected CFG's
`ManiaSpeed`, 4K direction, and exact generated profile modifiers. Etterna-to-osu! asserts
the selected profile's CMod, final integer `ManiaSpeed`, preservation of unrelated CFG
content, generated skin output, and atomic rollback. The standard full repository quality
gate and applicable real-skin compatibility audit run before completion.

## Documentation

`README.md` and `docs/architecture.md` will document the new speed sources, direction rule,
Windows-user CFG lookup, integer conversion, and atomic two-target Etterna-to-osu!
publication.
