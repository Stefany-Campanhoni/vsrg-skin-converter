# Etterna to osu! Position Calibration Offsets Design

## Goal

Apply two fixed empirical calibration offsets to the Etterna-to-osu! coordinate conversion:

- move the converted combo position down by reducing its numeric result by one;
- compensate the converted hit position by increasing its numeric result by one.

## Ownership

These values are route-specific equivalences, so they belong in
`src/conversions/etterna-to-osu` rather than the global game defaults or the osu! writer.
Each conversion module will own a named calibration constant. The shared defaults continue
to represent the neutral coordinates of each game.

## Conversion Rules

The calibration is applied after the existing one-to-one conversion and rounding:

```text
ComboPosition = round(230 + ComboY) - 1
HitPosition = round(438 + NoteFieldY) + 1
```

Examples:

- `ComboY = 0` produces `ComboPosition = 229`;
- `ComboY = -20` produces `ComboPosition = 209`;
- `NoteFieldY = 0` produces `HitPosition = 439`;
- `NoteFieldY = -6` produces `HitPosition = 433`.

Judgement position conversion is unchanged.

## Data Flow

The Etterna profile reader continues to return raw `ComboY` and `NoteFieldY` values. The
Etterna-to-osu! conversion applies rounding and the named calibration offsets. The osu!
writer receives the final values and writes them unchanged to `ComboPosition` and
`HitPosition` in `skin.ini`.

## Testing

Unit tests will cover neutral, integral-offset, and fractional inputs for both conversions.
The cross-module conversion and integration expectations will be updated to prove that the
calibrated values reach the generated `skin.ini`.

Implementation will follow TDD: update the expectations first, confirm they fail because the
offsets are absent, add the smallest production changes, and run the complete project gates.

## Scope

This change does not alter coordinate parsing, judgement position, receptor geometry,
global game defaults, combo image scaling, or template rendering behavior.
