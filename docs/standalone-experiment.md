# Manual Bun Standalone Experiment

The standalone Windows x64 executable is an experimental local artifact. It is not part of
the supported release, is not built by GitHub Actions, and must not be attached to a release.
The supported distribution remains the Windows portable ZIP.

## Build and automatic smoke tests

From a clean checkout with Bun 1.4.0 and the locked dependencies installed, run:

```powershell
bun ci
bun run build:standalone
```

The command compiles
`build/standalone/vsrg-skin-converter-v<version>-win-x64-experimental.exe` and then runs it
from a different working directory whose path contains spaces. The automated local checks
cover startup and version output, `--help`, a failing argument and its exit code, and a real
PNG resize through the embedded Sharp addon. These checks run with an empty `PATH`, so they
do not rely on a globally installed Bun or Node.js.

Sharp's Windows x64 N-API addon depends on two libvips DLLs. All three files are embedded in
the executable and verified by SHA-256 while building. At runtime, the executable verifies
and materializes them under
`%TEMP%/vsrg-skin-converter/standalone-native/<sharp-version>-<content-id>` before loading
the addon. The bundled templates remain inside the executable.

The command replaces only the ignored `build/standalone` directory. It does not create or
change workflows, release drafts, tags, or checksums, or supported release assets.

## Manual product validation

Build the supported portable ZIP from the same commit with `bun run build:windows`. Then
convert six representative real skins with both artifacts:

- three Etterna-to-osu!mania conversions;
- three osu!mania-to-Etterna conversions.

The corpus should cover notes, long notes, receptors, judgements, transparency, and images
at different resolutions. Compare the standalone outputs with the portable ZIP outputs from
the same commit, including image dimensions and visible pixels.

Record the candidate filename, commit, test corpus, and comparison result. Do not integrate
the experimental branch if any conversion differs or fails. A failed manual validation does
not block the main Bun migration or change the supported portable distribution.
