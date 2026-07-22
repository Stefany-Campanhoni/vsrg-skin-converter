import fs from "node:fs"
import path from "node:path"

export function getAllFilesInDirectory(dir: string): string[] {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true, recursive: true })

    return items
      .filter((item) => item.isFile())
      .map((item) => path.join(item.parentPath, item.name))
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error)
    return []
  }
}

export function getDirectoryContent(dir: string): string[] {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    return items.map((item) => path.join(item.parentPath, item.name))
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error)
    return []
  }
}

export function copyFilesToDirectory(sourceDir: string, targetDir: string): void {
  try {
    fs.mkdirSync(targetDir, { recursive: true })

    const itens = fs.readdirSync(sourceDir, { withFileTypes: true })

    itens.forEach((item) => {
      if (item.isFile()) {
        const filePath = path.join(sourceDir, item.name)
        const destinationPath = path.join(targetDir, item.name)

        fs.copyFileSync(filePath, destinationPath)
      }
    })
  } catch (err) {
    console.error("Error to copy files:", err instanceof Error ? err.message : String(err))
  }
}
