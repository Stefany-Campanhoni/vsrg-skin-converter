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
  const subprocess = Bun.spawn({
    cmd: ["powershell.exe", "-NoProfile", "-STA", "-Command", folderPickerCommand],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  })
  const [, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ])
  if (subprocess.exitCode !== 0) {
    throw new Error(
      `PowerShell folder picker exited with code ${subprocess.exitCode} and signal ${subprocess.signalCode}: ${stderr.trim()}`,
    )
  }
  return stdout
}

export const pickDirectory = createDirectoryPicker(runPowerShellFolderPicker)
