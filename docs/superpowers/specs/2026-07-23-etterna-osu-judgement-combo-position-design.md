# Etterna-to-osu! Judgement and Combo Position Design

**Date:** 2026-07-23

## Goal

Convert Etterna's 4K `JudgmentY` and `ComboY` profile coordinates into osu!mania
`ScorePosition` and `ComboPosition`, respectively, and render the converted integer values
into the generated `skin.ini`.

This design applies only to Etterna-to-osu! conversion.

## Source Data

The existing Etterna profile reader already extracts these numeric properties from
`GameplayXYCoordinates["4K"]` in `playerConfig.lua`:

- `JudgmentY` becomes `playfield.judgementPosition`.
- `ComboY` becomes `playfield.comboPosition`.

The 4K table lookup remains case-insensitive, so keys such as `"4K"` and `"4k"` continue
to resolve. This feature does not change Lua parsing or profile discovery.

## Equivalences

Both coordinates use a direct one-to-one offset from their neutral positions:

```text
osu ComboPosition = round(230 + Etterna ComboY)
osu ScorePosition = round(240 + Etterna JudgmentY)
```

Equivalently, using named game defaults:

```text
target = round(source - Etterna default + osu! default)
```

The defaults are:

| Coordinate | Etterna default | osu! default |
| --- | ---: | ---: |
| Combo | `0` | `230` |
| Judgement/score | `0` | `240` |

For the supplied profile values:

```text
ComboY = -20   -> ComboPosition = 210
JudgmentY = 4  -> ScorePosition = 244
```

Fractional converted values are rounded to the nearest integer with `Math.round`, matching
the existing hit-position conversion policy and the integer values written to `skin.ini`.

## Architecture

### Named defaults

`src/config/game-defaults.ts` owns the neutral coordinate values for both games. No
conversion or writer module embeds `230` or `240`.

The existing game entries gain:

```ts
etterna: {
  comboPosition: 0,
  judgementPosition: 0,
}

osu: {
  comboPosition: 230,
  judgementPosition: 240,
}
```

The domain retains the existing `judgementPosition` name. In an Etterna model it represents
`JudgmentY`; in an osu! model the writer serializes it as `ScorePosition`.

### Pure conversion modules

Two focused modules follow the established `convert-hit-position.ts` pattern:

- `convert-combo-position.ts` exports `getComboPosition`.
- `convert-judgement-position.ts` exports `getJudgementPosition`.

Each function accepts the corresponding Etterna coordinate, applies the source-to-target
default offset, rounds the result, and returns an osu! integer.

`EtternaToOsuConversion` calls both functions while constructing the target playfield. The
reader, neutral domain, and writer do not perform cross-game coordinate conversion.

### Template rendering

The osu! template replaces its fixed values with:

```ini
ComboPosition: ${combo_position}
ScorePosition: ${score_position}
```

`OsuSkinWriter` supplies:

```ts
combo_position: skin.playfield.comboPosition
score_position: skin.playfield.judgementPosition
```

The writer performs serialization only; it does not apply offsets or rounding.

## Data Flow

1. The Etterna profile reader extracts `ComboY` and `JudgmentY`.
2. The Etterna skin model stores them in `comboPosition` and `judgementPosition`.
3. `EtternaToOsuConversion` converts and rounds both coordinates using named defaults.
4. The osu! target model carries `ComboPosition` and score-position values in its existing
   playfield fields.
5. `OsuSkinWriter` renders those values into the copied `skin.ini`.
6. The existing transactional publisher publishes the completed workspace.

## Error Handling

The existing profile reader remains responsible for rejecting missing or non-numeric
`ComboY` and `JudgmentY`. The pure conversion functions operate on the validated numeric
domain values and add no new fallback behavior.

Template wildcards remain subject to the existing rendering contract: supplied values are
replaced, while unrelated unknown wildcards are preserved.

## Testing

### Conversion units

- `ComboY = 0` produces `230`.
- `ComboY = -20` produces `210`.
- A fractional combo result rounds to the nearest integer.
- `JudgmentY = 0` produces `240`.
- `JudgmentY = 4` produces `244`.
- A fractional judgement result rounds to the nearest integer.

### Conversion orchestration

- The Etterna-to-osu! conversion updates both playfield positions.
- Existing hit-position, column-width, assets, and diagnostics behavior remains unchanged.

### Template and writer

- The production template contains the two exact wildcards.
- The osu! writer supplies the converted combo and score values.
- Writer output contains concrete `ComboPosition` and `ScorePosition` lines with no
  remaining coordinate wildcards.

### Integration

Using `ComboY = -20` and `JudgmentY = 4`, the final converted `skin.ini` contains:

```ini
ComboPosition: 210
ScorePosition: 244
```

Existing receptor, tap-note, long-note, cleanup, and transactional assertions remain
unchanged.

## Non-Goals

- Converting `ComboX`, `JudgmentX`, or other profile coordinates.
- Supporting the reverse osu!-to-Etterna direction in this phase.
- Changing the Lua AST parser or profile discovery.
- Altering hit position, column width, receptor calibration, or image processing.
- Introducing a generic coordinate-conversion abstraction before another use case requires
  it.
