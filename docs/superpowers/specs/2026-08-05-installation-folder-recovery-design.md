# Installation Folder Recovery Design

## Objective

Keep the Etterna-to-osu! conversion usable when either default installation
directory is absent by letting the user select the installation with a native
Windows folder dialog.

## Flow

After the source game selection, the CLI checks `C:\\Games\\Etterna`. If it is
missing, it instructs the user to press any key and then opens the native folder
picker. The selected directory becomes the Etterna root for profile discovery,
theme resolution, skin listing, and skin reading.

Before publishing the converted skin, the CLI checks the default osu!
installation at `%LOCALAPPDATA%\\osu!`. If it is missing, it follows the same
press-any-key and native picker flow. The selected directory becomes the osu!
installation root, so output is written to `Skins/<skin name>` below it.
If `LOCALAPPDATA` is unavailable, the CLI treats the default as unavailable and
opens the same recovery flow without constructing a relative path.

Cancelling either picker ends the CLI normally without a user-facing message.

## Components

`src/cli/folder-picker.ts` owns the Windows Forms PowerShell dialog and its
output parsing. `src/cli/prompts.ts` owns the terminal pause that waits for a
single keypress. `src/cli/installation-directory.ts` owns directory inspection
and fallback coordination. `src/cli/main.ts` wires these components and uses
the resolved roots.

The former standalone script and `prototype:folder-picker` npm task are
removed. Its deterministic output-parsing tests move with the real component.

## Safety and validation

The PowerShell dialog is a fixed command and does not contain a selected path
or other user-controlled text. Dialog-process failures are wrapped with
folder-picker context and preserve their cause. A selected path must be an
existing directory before the CLI proceeds. Missing paths trigger recovery;
permission and other unexpected filesystem failures retain actionable context
and their original cause. The osu! output-path resolver continues to validate
the skin name and constructs a path only below the selected installation's
`Skins` directory.

## Tests

Unit tests cover parsing a selected or cancelled dialog result, contextual
dialog failures, default-path selection, exact fallback inputs, silent
cancellation, missing defaults, directory/file distinction, and filesystem
error preservation. Process and keypress operations are injected so tests
never open a native dialog or wait for terminal input.
