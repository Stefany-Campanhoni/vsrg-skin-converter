# osu! to Etterna Migration Design

## Goal

Add a 4K-only osu!mania-to-Etterna conversion that installs a generated NoteSkin and a
new local Etterna profile without changing the behavior of the existing
Etterna-to-osu! route.

## Scope

The first reverse-conversion release migrates:

- the osu! skin name;
- four normal receptors;
- four pressed receptors;
- four tap-note images;
- hit position;
- combo position;
- judgement position;
- averaged column width as Etterna receptor size;
- a new Etterna local profile for the selected osu! user.

It deliberately does not migrate:

- judgement images;
- judgement zoom;
- combo zoom;
- long-note images;
- fonts;
- key modes other than 4K.

The fixed `JudgmentZoom`, `ComboZoom`, long-note, mine, lift, and other static assets in
the Etterna template remain unchanged.

## Architecture

The existing route remains:

```text
EtternaSkinReader
  -> EtternaToOsuConversion
  -> OsuSkinWriter
  -> TransactionalOutputPublisher
```

The reverse route is additive:

```text
OsuSkinReader
  -> OsuToEtternaConversion
  -> EtternaSkinInstaller
       -> EtternaNoteSkinWriter
       -> EtternaProfileWriter
       -> TransactionalOutputSetPublisher
```

The existing `convertSkin`, `OsuSkinWriter`, and single-target publisher keep their
current contracts and behavior. The CLI composition root delegates to a focused
route coordinator instead of accumulating direction-specific conditionals in `main.ts`.

### Components

#### `OsuSkinCatalog`

Lists immediate skin directories below `<osu-root>/Skins`, reads each `skin.ini`, and
uses `[General] Name` as the user-facing and model name. Missing or invalid required
metadata is fatal rather than silently substituting the directory name.

#### `OsuConfigurationCatalog`

Lists only immediate files matching `osu!.*.cfg` below the osu! installation root.
One configuration is selected automatically. More than one is presented through the
existing select prompt, using the parsed `Username` as its label. No configuration is a
fatal error.

The selected configuration must contain:

- a non-empty, single-line `Username`;
- `Fullscreen` equal to `0` or `1`;
- positive numeric `Width` and `Height` when `Fullscreen=0`;
- positive numeric `WidthFullscreen` and `HeightFullscreen` when `Fullscreen=1`.

The selected resolution is high resolution when its width is greater than `1280` or
its height is greater than `720`. Exactly `1280x720` is standard resolution.

#### Ordered osu! INI parser

The parser preserves repeated sections because `skin.ini` commonly contains more than
one `[Mania]` block. Section and property names are case-insensitive. Values retain all
text after the first property delimiter, and the last assignment of a repeated property
within one section wins.

The reader requires exactly one `[General]` section with a non-empty `Name` and exactly
one `[Mania]` section whose parsed `Keys` value is `4`. Missing or multiple matching
sections are fatal.

The selected 4K section requires:

- `HitPosition`;
- `ComboPosition`;
- `ScorePosition`;
- `ColumnWidth`;
- `KeyImage0` through `KeyImage3`;
- `KeyImage0D` through `KeyImage3D`;
- `NoteImage0` through `NoteImage3`.

`ColumnWidth` accepts one positive numeric value, applied to every lane, or four positive
numeric values. Any other count is invalid.

#### `OsuSkinReader`

The reader maps osu! columns in this order:

| Column | Etterna direction | Normal receptor | Pressed receptor | Tap note |
| --- | --- | --- | --- | --- |
| 0 | Left | `KeyImage0` | `KeyImage0D` | `NoteImage0` |
| 1 | Down | `KeyImage1` | `KeyImage1D` | `NoteImage1` |
| 2 | Up | `KeyImage2` | `KeyImage2D` | `NoteImage2` |
| 3 | Right | `KeyImage3` | `KeyImage3D` | `NoteImage3` |

`NoteImage*H`, `NoteImage*L`, `NoteImage*T`, judgement, font, and long-note properties
are ignored. Every produced image asset has rotation zero and no spritesheet frame.
Judgement assets remain absent. Required neutral scale fields in the shared model use
`1`; the Etterna template, not the source model, owns the fixed zoom values for this
route.

## PNG and Density Resolution

Only PNG source files are supported. A property may omit `.png` or include it. Any
explicit non-PNG extension is rejected.

Resolution rules apply independently to every required image reference:

1. A logical path explicitly ending in `@2x` resolves only that exact `@2x` PNG and
   ignores the selected display resolution.
2. A logical path without `@2x` resolves only `<name>@2x.png` for a high-resolution
   configuration.
3. A logical path without `@2x` resolves only `<name>.png` for a standard-resolution
   configuration.
4. The resolver never falls back to the other density.

The resolver treats path segments case-insensitively, rejects ambiguous matches, rejects
absolute paths and traversal, and verifies the final real file remains below the selected
skin directory. Missing or invalid files are fatal.

Assets resolved from `@2x` receive Etterna's ` (doubleres)` filename decoration. Standard
assets do not. Pixel density is carried explicitly with the image asset instead of being
re-inferred by target writers.

## Conversion Rules

The reverse conversion uses its own focused functions and the same calibrated constants
as the forward route. It does not call the forward functions backward.

```text
NoteFieldY   = round(HitPosition) - 439
ComboY       = round(ComboPosition) - 229
JudgmentY    = round(ScorePosition) - 240
ReceptorSize = round(arithmeticMean(ColumnWidth) + 38)
```

The conversion returns an Etterna model while preserving the resolved receptors, tap
notes, and diagnostics. It does not create judgement or long-note assets.

## Etterna NoteSkin Output

The target path is:

```text
<etterna-root>/NoteSkins/dance/<General Name>
```

The directory name is preserved exactly. It must be a safe single Windows directory name:
non-empty, non-absolute, without `.`/`..`, separators, NUL, trailing dots or spaces,
reserved device names, or Windows-invalid characters. Unsafe names are rejected instead
of sanitized.

`EtternaNoteSkinWriter` copies `src/templates/etterna/noteskin` into its staging workspace
and adds:

```text
Receptors/release Left[ (doubleres)].png
Receptors/pressed Left[ (doubleres)].png
Receptors/release Down[ (doubleres)].png
Receptors/pressed Down[ (doubleres)].png
Receptors/release Up[ (doubleres)].png
Receptors/pressed Up[ (doubleres)].png
Receptors/release Right[ (doubleres)].png
Receptors/pressed Right[ (doubleres)].png

Notes/_Left Tap Note[ (doubleres)].png
Notes/_Down Tap Note[ (doubleres)].png
Notes/_Up Tap Note[ (doubleres)].png
Notes/_Right Tap Note[ (doubleres)].png
```

Each note PNG is copied byte-for-byte without rotation, resizing, or frame extraction.

Each non-empty receptor is transformed as follows:

1. inspect alpha without removing lateral columns;
2. find the first and last rows containing a visible pixel;
3. crop only transparent rows above and below that range;
4. preserve the original full width;
5. resize the cropped region vertically to an exact `width x width` square;
6. encode the result as PNG.

A fully transparent normal receptor is preserved byte-for-byte. A fully transparent
pressed receptor reuses the processed normal receptor from the same direction, including
the normal receptor's density decoration. Missing references and undecodable PNGs remain
fatal.

## Etterna Profile Output

The installer examines immediate child directories of
`<etterna-root>/Save/LocalProfiles` whose names match exactly eight decimal digits.
Non-matching directories are ignored.

- no valid directory produces `00000000`;
- otherwise the highest ID plus one is formatted as eight digits;
- `99999999` is a fatal exhaustion error;
- the new target must not exist at publication time and is never overwritten.

The profile display name comes from the selected osu! CFG `Username`, not the skin name.
The installer reads the target Etterna theme from `Save/Preferences.ini` through the same
theme lookup used by the forward route. It does not modify `Preferences.ini`.

The profile layout is:

```text
<etterna-root>/Save/LocalProfiles/<profile-id>/
  Editable.ini
  Etterna.xml
  Type.ini
  <active-theme>_settings/
    playerConfig.lua
```

The writer copies `src/templates/etterna/profile`, relocates the template
`playerConfig.lua` into the theme-specific directory, and renders:

- `${profile_name}` in `Editable.ini` and `Etterna.xml`;
- `${guid}` in `Etterna.xml`;
- `${hit_position}` as `NoteFieldY`;
- `${combo_position}` as `ComboY`;
- `${judgement_position}` as `JudgmentY`;
- `${receptor_size}` as `ReceptorSize`.

Template values are escaped for their destination syntax. User-controlled values cannot
inject new INI assignments, XML markup, or Lua expressions.

The GUID generator uses `randomBytes(8).toString("hex")`, producing exactly sixteen
lowercase hexadecimal characters. It scans GUIDs from existing valid local profiles and
regenerates on a local collision. A bounded retry limit turns an injected or pathological
collision source into a fatal error instead of an infinite loop.

## CLI Flow

The CLI continues to ask for the source game. With only `osu` and `etterna` registered,
the target is the other game.

### Etterna to osu!

The existing source installation, profile selection, theme lookup, conversion, and osu!
output behavior remain unchanged and retain their existing regression tests.

### osu! to Etterna

1. Resolve the osu! installation from `%LOCALAPPDATA%/osu!`; if unavailable, pause and
   open the existing directory picker.
2. Discover and select the osu! user configuration.
3. Discover and select the osu! skin.
4. Resolve `C:/Games/Etterna`; if unavailable, use the same fallback interaction.
5. Read the active Etterna theme.
6. Resolve the target NoteSkin name and check whether it exists.
7. If it exists, ask for explicit overwrite confirmation. Declining cancels the complete
   operation before allocating or publishing a profile.
8. Read, convert, stage, and atomically install the NoteSkin and profile.
9. Present ordered diagnostics through the existing CLI formatting.

The overwrite question belongs to the CLI. The installer receives an explicit overwrite
policy and contains no prompt dependency.

## Multi-Target Transaction Safety

`TransactionalOutputSetPublisher` accepts a set of non-overlapping target directories and
builders. It validates that all targets are inside their expected Etterna subtrees and that
no target is a filesystem root or an ancestor of another target.

Publication proceeds as follows:

1. create one sibling staging directory for every target;
2. run and settle every builder before changing any target;
3. recheck the profile target's must-not-exist condition;
4. move an authorized existing NoteSkin to a unique backup;
5. promote all staging directories;
6. if any promotion fails, remove newly promoted targets and restore every backup;
7. remove backups only after every target is installed;
8. clean all staging directories on success or failure.

The profile target always uses a must-not-exist policy. The NoteSkin target uses either
must-not-exist or replace-existing according to the CLI confirmation. Filesystem errors
retain target and operation context while preserving the original cause.

## Error Policy

All required configuration, parsing, path, image, template, profile-allocation, and
publication failures are fatal. The converter never installs a partial NoteSkin or profile.

Judgements, long notes, fonts, and combo zoom are explicit non-goals and do not emit
missing-asset warnings. Warnings remain ordered and are reserved for recoverable behavior
that still produces a complete output.

## Testing Strategy

Unit tests cover:

- ordered INI parsing, repeated sections, case-insensitive properties, and last-write
  semantics;
- exact 4K section selection and malformed required values;
- osu! CFG discovery, selection data, fullscreen resolution, and validation;
- explicit, high-resolution, and standard-resolution PNG selection;
- case-insensitive resolution, ambiguity, traversal, symlink escape, and PNG-only rules;
- every inverse formula, arithmetic mean, and final rounding;
- vertical-only receptor cropping and square normalization;
- transparent normal preservation and pressed-to-normal fallback;
- exact NoteSkin filenames and density decoration;
- profile ID allocation, exhaustion, and race protection;
- GUID format, collision retries, and retry exhaustion;
- context-safe INI, XML, and Lua rendering;
- target-theme placement of `playerConfig.lua`;
- overwrite confirmation routing;
- multi-target staging, promotion, cleanup, and rollback at every failure boundary.

Integration tests build temporary osu! and Etterna installations and verify:

- a multi-section `skin.ini` selects only the 4K block;
- the selected CFG controls user name and implicit density;
- twelve generated NoteSkin images have exact names, bytes, and dimensions;
- inverse values appear in the generated `playerConfig.lua`;
- the new profile ID and GUID are valid and unique;
- profile files appear in their exact target directories;
- declining overwrite produces no changes;
- authorized overwrite replaces only the named NoteSkin;
- a simulated second-target failure restores the previous NoteSkin and creates no profile;
- the existing Etterna-to-osu! integration test remains unchanged and green.

Full verification includes tests, typecheck, lint, architecture checks, unused-symbol checks,
and `git diff --check`. The manual receptor trim script is not executed because it writes
to `.tmp`.
