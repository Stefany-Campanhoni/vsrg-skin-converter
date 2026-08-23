# vsrg-skin-converter

## 1.0.0

### Major Changes

- [#31](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/31) [`5a8b1b7`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/5a8b1b7d416f7448f7f71e77770fdbda4e9a3ce5) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Release the first stable version of VSRG Skin Converter.

### Minor Changes

- [#11](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/11) [`ccd25b1`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/ccd25b16843cf1f8529c1b51011d46e9ec5369b7) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Migrate the relative osu! combo digit scale to the Etterna `ComboZoom` setting.

- [#16](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/16) [`4397076`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/43970767043809d11e962456e778e8f90698c4ce) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Migrate scroll speed and scroll direction between osu!mania and Etterna.

### Patch Changes

- [#25](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/25) [`25245db`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/25245db4aea8964b80deb58fe8f4493304bff16f) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Use the Etterna template's native judgement scale for generated profiles.

- [#27](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/27) [`d274d6b`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/d274d6b33b2c11605a2aa22a758e65a2ff4ae455) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Keep the Windows launcher open after successful interactive runs until the user presses a key.

- [#30](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/30) [`604899a`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/604899ab6f25ea3557631a7088396c165b3ac000) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Preserve osu!mania note and receptor aspect ratios in Etterna by scaling their generated assets to target widths and writing proportional logical resolutions in their filenames.

- [#28](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/28) [`44a1ebf`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/44a1ebfec94408b9d4d9ac79fda10ca75e481f17) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Trim the generated Etterna player configuration template to its essential settings.

- [#29](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/29) [`c11dc18`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/c11dc18c7949487fb5d62a673e93eeba82fd6b97) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Fall back to osu!mania's default 4K note and receptor images when skin.ini references are absent or empty.

- [#7](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/7) [`20a7b31`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/20a7b31daaf873de05d07bcf5261d69e369cb538) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Automate version planning, changelog updates, and verified Windows draft releases.

- [#21](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/21) [`fa06474`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/fa0647455911abfd3a563d1862e1c093926ee642) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Use the osu! skin directory name when `skin.ini` does not define a valid General name.

- [#20](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/20) [`e54336c`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/e54336c80f62c8c5c1b94e484fab659e025e7b2b) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Print complete error stack traces when the CLI runs through the development script.

- [#19](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/19) [`1e2b9cb`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/1e2b9cb6007cfae9f8ad53c3e7a92723fdac07f4) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Show each Etterna profile ID as the hint in the profile selection prompt.

- [#23](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/23) [`0a5cc1f`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/0a5cc1ff91723a0482a9bdac0b77db1dfea5c9b6) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Use the bundled osu!mania default for missing judgement images when converting an osu! skin to Etterna.

- [#22](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/22) [`d2ac6f5`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/d2ac6f5d42080769cb0022e8b16167b6cc922266) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Read UTF-8 Etterna asset configurations and judgement paths without Latin-1 restrictions.

## 0.1.0-beta.2

### Minor Changes

- [#11](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/11) [`ccd25b1`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/ccd25b16843cf1f8529c1b51011d46e9ec5369b7) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Migrate the relative osu! combo digit scale to the Etterna `ComboZoom` setting.

- [#16](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/16) [`4397076`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/43970767043809d11e962456e778e8f90698c4ce) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Migrate scroll speed and scroll direction between osu!mania and Etterna.

### Patch Changes

- [#7](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/7) [`20a7b31`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/20a7b31daaf873de05d07bcf5261d69e369cb538) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Automate version planning, changelog updates, and verified Windows draft releases.

- [#21](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/21) [`fa06474`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/fa0647455911abfd3a563d1862e1c093926ee642) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Use the osu! skin directory name when `skin.ini` does not define a valid General name.

- [#20](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/20) [`e54336c`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/e54336c80f62c8c5c1b94e484fab659e025e7b2b) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Print complete error stack traces when the CLI runs through the development script.

- [#19](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/19) [`1e2b9cb`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/1e2b9cb6007cfae9f8ad53c3e7a92723fdac07f4) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Show each Etterna profile ID as the hint in the profile selection prompt.

- [#23](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/23) [`0a5cc1f`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/0a5cc1ff91723a0482a9bdac0b77db1dfea5c9b6) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Use the bundled osu!mania default for missing judgement images when converting an osu! skin to Etterna.

- [#22](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/pull/22) [`d2ac6f5`](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/commit/d2ac6f5d42080769cb0022e8b16167b6cc922266) Thanks [@Stefany-Campanhoni](https://github.com/Stefany-Campanhoni)! - Read UTF-8 Etterna asset configurations and judgement paths without Latin-1 restrictions.

This changelog is maintained by Changesets. Historical work before Changesets adoption is
represented by the current `0.1.0-beta.1` package version and the Git history.
