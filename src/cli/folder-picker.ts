import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const folderPickerCommand = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
  "[Console]::Out.Write($dialog.SelectedPath)",
  "}",
].join("; ")

export function parseSelectedDirectory(output: string): string | undefined {
  const selectedDirectory = output.trim()
  return selectedDirectory === "" ? undefined : selectedDirectory
}

export function createDirectoryPicker(
  runDirectoryDialog: () => Promise<string>,
): () => Promise<string | undefined> {
  return async () => {
    try {
      return parseSelectedDirectory(await runDirectoryDialog())
    } catch (cause) {
      throw new Error("Could not open the Windows folder picker", { cause })
    }
  }
}

async function runPowerShellFolderPicker(): Promise<string> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-Command",
    folderPickerCommand,
  ])
  return stdout
}

export const pickDirectory = createDirectoryPicker(runPowerShellFolderPicker)
