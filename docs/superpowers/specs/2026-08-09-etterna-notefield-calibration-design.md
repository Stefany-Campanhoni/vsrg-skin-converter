# Etterna NoteField Calibration Design

## Goal

Move the receptor one Etterna unit upward for every osu!mania-to-Etterna migration.

## Design

`EtternaProfileWriter` will add a named calibration of `+1` to the converted
Etterna hit position before it renders `NoteFieldY` into `playerConfig.lua`.
This confines the adjustment to the generated Etterna profile; conversion
coordinates, combo and judgement positions, and the Etterna-to-osu! route are
unchanged.

## Verification

The profile-writer test will use an input hit position of `-7` and assert that
the generated profile contains `NoteFieldY= -6`, while retaining its existing
combo and judgement values.
