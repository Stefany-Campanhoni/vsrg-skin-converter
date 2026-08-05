# Etterna Theme Resolution Design

## Goal

Resolve the active Etterna theme from `Save/Preferences.ini` rather than assuming
`Rebirth`, then use that theme for every theme-specific settings path.

## Theme Resolution

The Etterna adapter reads:

```text
<gameRoot>/Save/Preferences.ini
```

Only assignments inside the `[Options]` section are considered. Option names are
matched case-insensitively and values are trimmed.

1. Use `Theme` when it has a non-empty value.
2. Otherwise use non-empty `DefaultTheme`.
3. If neither is present, throw an actionable error that names `Preferences.ini`.

## Consumers

One resolved theme is supplied to both theme-dependent Etterna reads:

```text
<gameRoot>/Save/LocalProfiles/<profileId>/<theme>_settings/playerConfig.lua
<gameRoot>/Save/<theme>_settings/assetsConfig.lua
```

This guarantees playfield configuration and judgement selection match the same active
Etterna theme.

## Boundaries and Tests

INI parsing and theme-path rules remain in `src/adapters/etterna`. The CLI chooses the
profile and invokes the adapter's theme reader; it does not parse Etterna preferences.
Profile IDs and theme names are validated as single directory names before settings paths
are composed. Tests cover a configured theme, fallback to `DefaultTheme`, ignored values
outside `[Options]`, missing theme settings, unsafe path segments, and the generated
profile/global settings paths.
