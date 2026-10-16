import type { PageCopy } from "./page-copy.ts"
import type { ConversionPreview } from "./worker-messages.ts"

export function createArtworkPresentation(root: HTMLElement) {
  let shown: ConversionPreview | undefined
  const urls: string[] = []
  function clear() {
    for (const url of urls) URL.revokeObjectURL(url)
    urls.length = 0
    shown = undefined
    root.replaceChildren()
  }
  return {
    clear,
    show(preview: ConversionPreview, copy: PageCopy) {
      if (shown !== preview) {
        clear()
        shown = preview
        root.dataset.downscroll = String(preview.playfield.isDownscroll ?? false)
        for (const [index, lane] of preview.artwork.entries()) {
          const column = document.createElement("div")
          column.className = "preview-lane"
          column.style.setProperty("--note-position", `${[22, 46, 32, 60][index]}%`)
          for (const kind of ["note", "receptor"] as const) {
            const image = document.createElement("img")
            image.className = `${kind}-image`
            image.dataset.direction = lane.direction
            const url = URL.createObjectURL(
              new Blob([new Uint8Array(lane[kind])], { type: "image/png" }),
            )
            urls.push(url)
            image.src = url
            column.append(image)
          }
          const key = document.createElement("span")
          key.className = "preview-key"
          key.textContent = String(index + 1)
          column.append(key)
          root.append(column)
        }
      }
      for (const image of root.querySelectorAll<HTMLImageElement>("img")) {
        const direction = image.dataset.direction as "left" | "down" | "up" | "right"
        image.alt = `${image.classList.contains("note-image") ? copy.note : copy.receptor} · ${copy[direction]}`
      }
    },
  }
}
