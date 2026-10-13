import type { EtternaSourceDiscovery } from "../adapters/etterna/catalog/discover-etterna-source.ts"
import type { ReadableDirectoryHandle } from "../application/ports/source-files.ts"
import { createArtworkPresentation } from "./artwork-presentation.ts"
import { type ConversionState, createConversionController } from "./conversion-controller.ts"
import { createConversionWorkerTransport } from "./conversion-worker-transport.ts"
import { applyPageCopy, type PageCopyKey, type PageLanguage } from "./page-copy.ts"
import type { BrowserSource, WebConversionRequest } from "./worker-messages.ts"

function element<T extends HTMLElement>(id: string, kind: { new (): T }): T {
  const found = document.getElementById(id)
  if (!(found instanceof kind)) throw new Error(`Missing page element ${id}`)
  return found
}
const select = element("select", HTMLButtonElement),
  fallback = element("fallback", HTMLButtonElement),
  folder = element("folder", HTMLInputElement),
  convert = element("convert", HTMLButtonElement),
  reset = element("reset", HTMLButtonElement),
  next = element("next", HTMLButtonElement),
  back = element("back", HTMLButtonElement),
  skin = element("skin", HTMLSelectElement),
  profile = element("profile", HTMLSelectElement),
  density = element("density", HTMLSelectElement),
  status = element("conversion-status", HTMLParagraphElement),
  error = element("error", HTMLParagraphElement),
  download = element("download", HTMLAnchorElement),
  values = element("values", HTMLDListElement),
  diagnostics = element("diagnostics", HTMLUListElement),
  language = element("language", HTMLSelectElement),
  uiTheme = element("ui-theme", HTMLSelectElement)
let copy = applyPageCopy("en"),
  direction: WebConversionRequest["direction"] = "etterna-to-osu",
  source: BrowserSource | undefined,
  discovery: EtternaSourceDiscovery | undefined,
  sourceName = "",
  epoch = 0,
  url: string | undefined,
  ready = false,
  routeAnimation: Animation | undefined,
  currentStep: "source" | "review" | "download" = "source",
  pickerEpoch: number | undefined,
  statusOverride: PageCopyKey | undefined,
  localError: string | undefined
const artwork = createArtworkPresentation(element("skin-artwork", HTMLElement))
const controller = createConversionController(() =>
  createConversionWorkerTransport(
    new Worker(new URL("./conversion-worker.js", import.meta.url), { type: "module" }),
  ),
)
function revoke() {
  if (url) URL.revokeObjectURL(url)
  url = undefined
  download.removeAttribute("href")
  download.hidden = true
}
const playfieldKeys = [
  "hitPosition",
  "judgementPosition",
  "comboPosition",
  "columnWidth",
  "comboScale",
  "judgementScale",
  "isDownscroll",
] as const
function renderState(state: ConversionState) {
  const busy =
    statusOverride === "waitingFolder" ||
    statusOverride === "checking" ||
    state.phase === "initializing" ||
    state.phase === "selecting" ||
    state.phase === "converting" ||
    (state.phase === "review" && !state.preview)
  select.disabled = fallback.disabled = !ready || busy
  convert.disabled = state.phase !== "review" || !state.preview
  convert.hidden = currentStep !== "review" || busy
  next.hidden = currentStep !== "source" || busy
  next.disabled = !source || busy || !ready
  back.hidden = currentStep !== "review" || busy
  download.hidden = currentStep !== "download" || !url
  skin.disabled = profile.disabled = density.disabled = busy
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="direction"]'))
    radio.disabled = state.phase === "initializing" || busy
  error.hidden = state.phase !== "error" && !localError
  error.textContent = localError ?? state.message ?? ""
  const statusKey: PageCopyKey =
    statusOverride ??
    (currentStep === "source" && source && !busy
      ? "sourceReady"
      : state.phase === "initializing"
        ? "initializing"
        : state.phase === "idle"
          ? source
            ? "sourceReady"
            : "idle"
          : state.phase === "selecting"
            ? "checking"
            : state.phase === "review"
              ? state.preview
                ? "reviewed"
                : "reviewing"
              : state.phase === "converting"
                ? (state.progress?.phase ?? "reading")
                : state.phase === "success"
                  ? "success"
                  : "failed")
  status.textContent = copy[statusKey]
  element("folder-selection", HTMLElement).hidden = busy
  element("processing", HTMLElement).hidden = !busy
  element("processing-stage", HTMLElement).textContent = copy[statusKey]
  element("source-panel", HTMLElement).setAttribute("aria-busy", String(busy))
  element("source-stage", HTMLElement).hidden = busy || currentStep !== "source"
  element("review-stage", HTMLElement).hidden = busy || currentStep !== "review"
  element("download-stage", HTMLElement).hidden = busy || currentStep !== "download"
  element("source-title", HTMLElement).textContent =
    direction === "etterna-to-osu" ? copy.sourceEtterna : copy.sourceOsu
  element("source-help", HTMLElement).textContent =
    direction === "etterna-to-osu" ? copy.helpEtterna : copy.helpOsu
  element("selection", HTMLElement).textContent = source
    ? `${copy.selected}: ${sourceName}`
    : copy.empty
  element("theme", HTMLElement).textContent = discovery
    ? `${copy.gameTheme}: ${discovery.theme}`
    : ""
  const defaultOption = profile.options[0]
  if (defaultOption?.value === "") defaultOption.textContent = copy.defaultProfile
  element("review", HTMLElement).hidden = !state.preview
  element("result-filename", HTMLElement).textContent = state.result?.filename ?? ""
  values.replaceChildren()
  diagnostics.replaceChildren()
  if (state.preview) {
    artwork.show(state.preview, copy)
    for (const key of playfieldKeys) {
      const value = state.preview.playfield[key]
      if (value === undefined) continue
      const dt = document.createElement("dt"),
        dd = document.createElement("dd")
      dt.textContent = copy[key]
      dd.textContent = typeof value === "boolean" ? (value ? copy.yes : copy.no) : String(value)
      values.append(dt, dd)
    }
    if (state.preview.convertedManiaSpeed !== undefined) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd")
      dt.textContent = copy.maniaSpeed
      dd.textContent = String(state.preview.convertedManiaSpeed)
      values.append(dt, dd)
    }
    for (const diagnostic of [...(discovery?.diagnostics ?? []), ...state.preview.diagnostics]) {
      const li = document.createElement("li")
      li.textContent = diagnostic.message
      diagnostics.append(li)
    }
  }
  element("conversion-notes", HTMLElement).hidden = diagnostics.childElementCount === 0
  for (const step of document.querySelectorAll<HTMLElement>("[data-step]")) {
    const current = step.dataset.step === currentStep
    step.dataset.active = String(current)
    if (current) step.setAttribute("aria-current", "step")
    else step.removeAttribute("aria-current")
  }
  const progress = element("progress", HTMLProgressElement)
  progress.hidden = state.phase !== "converting"
  progress.value = state.progress
    ? ["reading", "converting", "rendering", "archiving"].indexOf(state.progress.phase) +
      state.progress.completed
    : 0
}
controller.subscribe((state) => {
  if (state.phase === "idle") ready = true
  if (state.phase === "initializing") ready = false
  statusOverride = undefined
  localError = undefined
  if (state.phase === "success") currentStep = "download"
  if (state.phase === "error" && currentStep === "download") currentStep = "source"
  renderState(state)
  if (state.result) {
    revoke()
    url = URL.createObjectURL(
      new Blob([new Uint8Array(state.result.archive)], { type: "application/zip" }),
    )
    download.href = url
    download.download = state.result.filename
    download.hidden = false
    element("download-title", HTMLElement).focus({ preventScroll: true })
  } else if (state.phase === "review" && state.preview && currentStep === "review") {
    element("review-title", HTMLElement).focus({ preventScroll: true })
  }
})
language.onchange = () => {
  const next: PageLanguage = language.value === "pt-BR" ? "pt-BR" : "en"
  copy = applyPageCopy(next)
  renderState(controller.state)
}
uiTheme.onchange = () => {
  document.documentElement.dataset.theme = uiTheme.value === "light" ? "light" : "dark"
}
function review() {
  if (!source) return
  currentStep = "review"
  artwork.clear()
  statusOverride = undefined
  const request: WebConversionRequest =
    direction === "etterna-to-osu"
      ? {
          direction,
          source,
          skinPath: skin.value,
          profileId: profile.value || undefined,
          theme: discovery?.theme ?? "Rebirth",
          useDefaultSettings: !profile.value,
        }
      : {
          direction,
          source,
          skinName: sourceName,
          useDoubleResolutionAssets: density.value === "hd",
        }
  controller.review(request)
}
function option(value: string, label: string) {
  const item = document.createElement("option")
  item.value = value
  item.textContent = label
  return item
}
async function waitReady() {
  if (controller.state.phase === "idle") return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error(copy.timeout))
    }, 30000)
    const unsubscribe = controller.subscribe((state) => {
      if (state.phase === "idle" || state.phase === "error") {
        clearTimeout(timeout)
        queueMicrotask(unsubscribe)
        state.phase === "idle" ? resolve() : reject(new Error(state.message))
      }
    })
  })
}
async function accept(next: BrowserSource, name: string) {
  const ticket = ++epoch
  currentStep = "source"
  artwork.clear()
  revoke()
  select.disabled = fallback.disabled = true
  try {
    if (source) {
      await controller.reset()
      await waitReady()
    }
    if (ticket !== epoch) return
    source = undefined
    discovery = undefined
    localError = undefined
    statusOverride = "checking"
    renderState(controller.state)
    const found = direction === "etterna-to-osu" ? await controller.discover(next) : undefined
    if (ticket !== epoch) return
    source = next
    sourceName = name
    discovery = found
    skin.replaceChildren(...(found?.skins ?? []).map((item) => option(item.path, item.name)))
    profile.replaceChildren(
      option("", copy.defaultProfile),
      ...(found?.profileIds ?? []).map((id) => option(id, id)),
    )
    if (found?.profileIds[0]) profile.value = found.profileIds[0]
    element("options", HTMLElement).hidden = false
    statusOverride = undefined
    renderState(controller.state)
  } catch (cause) {
    if (ticket !== epoch) return
    localError = cause instanceof Error ? cause.message : copy.folderError
    statusOverride = "validFolder"
    renderState(controller.state)
    select.disabled = fallback.disabled = false
  }
}
function beginFolderSelection() {
  pickerEpoch = epoch
  statusOverride = "waitingFolder"
  localError = undefined
  renderState(controller.state)
}
function cancelFolderSelection() {
  const ticket = pickerEpoch
  pickerEpoch = undefined
  if (ticket !== epoch) return
  statusOverride = undefined
  renderState(controller.state)
}
function selectFileList() {
  beginFolderSelection()
  folder.click()
}
select.onclick = async () => {
  if (!("showDirectoryPicker" in window) || typeof window.showDirectoryPicker !== "function") {
    selectFileList()
    return
  }
  beginFolderSelection()
  const ticket = epoch
  try {
    const picker = window.showDirectoryPicker as (options: {
      mode: "read"
    }) => Promise<ReadableDirectoryHandle>
    const handle = await picker({ mode: "read" })
    if (ticket !== epoch) return
    pickerEpoch = undefined
    await accept({ kind: "directory-handle", handle }, handle.name)
  } catch (cause) {
    if (ticket !== epoch) return
    if (cause instanceof DOMException && cause.name === "AbortError") {
      cancelFolderSelection()
      return
    }
    pickerEpoch = undefined
    statusOverride = undefined
    localError = cause instanceof Error ? cause.message : copy.pickerError
    renderState(controller.state)
  }
}
fallback.onclick = selectFileList
folder.addEventListener("cancel", cancelFolderSelection)
folder.onchange = () => {
  const ticket = pickerEpoch ?? epoch
  pickerEpoch = undefined
  if (ticket !== epoch) {
    folder.value = ""
    return
  }
  const files = [...(folder.files ?? [])]
  folder.value = ""
  if (files.length)
    void accept({ kind: "file-list", files }, files[0]?.webkitRelativePath.split("/")[0] ?? "Skin")
  else {
    statusOverride = undefined
    renderState(controller.state)
  }
}
next.onclick = review
back.onclick = () => {
  currentStep = "source"
  renderState(controller.state)
}
convert.onclick = () => {
  currentStep = "download"
  controller.convert()
}
async function clear() {
  ++epoch
  currentStep = "source"
  statusOverride = undefined
  folder.value = ""
  artwork.clear()
  source = undefined
  discovery = undefined
  sourceName = ""
  revoke()
  element("options", HTMLElement).hidden = true
  await controller.reset()
}
reset.onclick = () => void clear()
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="direction"]'))
  radio.onchange = () => {
    direction = radio.value as WebConversionRequest["direction"]
    document.documentElement.dataset.direction = direction
    element("etterna-options", HTMLElement).hidden = direction !== "etterna-to-osu"
    element("osu-options", HTMLElement).hidden = direction !== "osu-to-etterna"
    element("manual-speed", HTMLElement).hidden = direction !== "osu-to-etterna"
    void clear()
    routeAnimation?.cancel()
    routeAnimation = element("source-panel", HTMLElement)
      .closest(".converter")
      ?.animate(
        [
          { transform: "translateX(12px)", opacity: 0.92 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        {
          duration: Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--route-duration"),
          ),
          easing: "ease-out",
        },
      )
  }
window.addEventListener("pagehide", () => {
  routeAnimation?.cancel()
  artwork.clear()
  revoke()
  void controller.dispose()
})
function showStatus(key: PageCopyKey) {
  statusOverride = key
  renderState(controller.state)
}
async function initialize() {
  if (!isSecureContext || !("serviceWorker" in navigator)) {
    showStatus("unsupported")
    return
  }
  if (!crossOriginIsolated) {
    showStatus("isolation")
    for (let attempt = 0; attempt < 100 && !crossOriginIsolated; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100))
    if (!crossOriginIsolated) {
      showStatus("isolationFailed")
      return
    }
  }
  controller.initialize()
}
void initialize()
