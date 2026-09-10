export interface PortableDependency {
  readonly packagePath: string
  readonly licenseFile: string
}

export const portableDependencies = [
  { packagePath: "sharp", licenseFile: "LICENSE" },
  { packagePath: "detect-libc", licenseFile: "LICENSE" },
  { packagePath: "semver", licenseFile: "LICENSE" },
  { packagePath: "@img/colour", licenseFile: "LICENSE.md" },
  { packagePath: "@img/sharp-win32-x64", licenseFile: "LICENSE" },
] as const satisfies readonly PortableDependency[]

export const portableRequiredFiles = [
  "vsrg-skin-converter.cmd",
  "app.mjs",
  "runtime/bun.exe",
  "README.txt",
  "LICENSE",
  "THIRD-PARTY-NOTICES.txt",
  ...portableDependencies.map(
    ({ packagePath, licenseFile }) => `node_modules/${packagePath}/${licenseFile}`,
  ),
] as const

export const portableFixedDirectories = [
  "runtime",
  "node_modules",
  "node_modules/@img",
  ...portableDependencies.map(({ packagePath }) => `node_modules/${packagePath}`),
] as const

export function isPortableDependencyEntry(relative: string): boolean {
  return portableDependencies.some(({ packagePath }) =>
    relative.startsWith(`node_modules/${packagePath}/`),
  )
}
