import {
  discoverEtternaSource,
  type EtternaSourceDiscovery,
} from "../adapters/etterna/catalog/discover-etterna-source.ts"
import type { ReadableDirectoryHandle } from "../application/ports/source-files.ts"
import { createBrowserSourceFiles } from "./browser-source.ts"
import { createConversionController } from "./conversion-controller.ts"
import { createConversionWorkerTransport } from "./conversion-worker-transport.ts"
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
  skin = element("skin", HTMLSelectElement),
  profile = element("profile", HTMLSelectElement),
  density = element("density", HTMLSelectElement),
  status = element("conversion-status", HTMLParagraphElement),
  error = element("error", HTMLParagraphElement),
  download = element("download", HTMLAnchorElement),
  values = element("values", HTMLDListElement),
  diagnostics = element("diagnostics", HTMLUListElement)
let direction: WebConversionRequest["direction"] = "etterna-to-osu",
  source: BrowserSource | undefined,
  discovery: EtternaSourceDiscovery | undefined,
  sourceName = "",
  epoch = 0,
  url: string | undefined,
  ready = false
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
const labels = {
  hitPosition: "Posição dos receptores",
  judgementPosition: "Posição do judgement",
  comboPosition: "Posição do combo",
  columnWidth: "Tamanho / largura",
  comboScale: "Escala do combo",
  judgementScale: "Escala do judgement",
  isDownscroll: "Scroll para baixo",
}
controller.subscribe((state) => {
  if (state.phase === "idle") ready = true
  if (state.phase === "initializing") ready = false
  const busy =
    state.phase === "initializing" ||
    state.phase === "converting" ||
    (state.phase === "review" && !state.preview)
  select.disabled = fallback.disabled = !ready || busy
  convert.disabled = state.phase !== "review" || !state.preview
  skin.disabled = profile.disabled = density.disabled = busy
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="direction"]'))
    radio.disabled = state.phase === "initializing"
  error.hidden = state.phase !== "error"
  error.textContent = state.message ?? ""
  status.textContent =
    state.phase === "initializing"
      ? "Preparando o processamento local…"
      : state.phase === "idle"
        ? "Pronto. Selecione a pasta de origem."
        : state.phase === "review"
          ? state.preview
            ? "Revisão pronta. Confira os valores e converta."
            : "Lendo e validando a skin…"
          : state.phase === "converting"
            ? {
                reading: "Lendo arquivos…",
                converting: "Convertendo configurações…",
                rendering: "Processando imagens…",
                archiving: "Preparando ZIP…",
              }[state.progress?.phase ?? "reading"]
            : state.phase === "success"
              ? "Conversão concluída. Seu ZIP está pronto."
              : "Não foi possível concluir. Verifique os arquivos ou recomece."
  element("review", HTMLElement).hidden = !state.preview
  values.replaceChildren()
  diagnostics.replaceChildren()
  if (state.preview) {
    for (const [key, label] of Object.entries(labels)) {
      const value = state.preview.playfield[key as keyof typeof labels]
      if (value === undefined) continue
      const dt = document.createElement("dt"),
        dd = document.createElement("dd")
      dt.textContent = label
      dd.textContent = typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)
      values.append(dt, dd)
    }
    if (state.preview.convertedManiaSpeed !== undefined) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd")
      dt.textContent = "ManiaSpeed (aplicar manualmente)"
      dd.textContent = String(state.preview.convertedManiaSpeed)
      values.append(dt, dd)
    }
    for (const diagnostic of [...(discovery?.diagnostics ?? []), ...state.preview.diagnostics]) {
      const li = document.createElement("li")
      li.textContent = diagnostic.message
      diagnostics.append(li)
    }
  }
  const progress = element("progress", HTMLProgressElement)
  progress.hidden = state.phase !== "converting"
  progress.value = state.progress
    ? ["reading", "converting", "rendering", "archiving"].indexOf(state.progress.phase) +
      state.progress.completed
    : 0
  element("result-help", HTMLElement).hidden = state.phase !== "success"
  if (state.result) {
    revoke()
    url = URL.createObjectURL(
      new Blob([new Uint8Array(state.result.archive)], { type: "application/zip" }),
    )
    download.href = url
    download.download = state.result.filename
    download.hidden = false
  }
})
function review() {
  if (!source) return
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
      reject(new Error("O processamento local não iniciou. Recarregue a página."))
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
  revoke()
  select.disabled = fallback.disabled = true
  try {
    if (source) {
      await controller.reset()
      await waitReady()
    }
    source = undefined
    discovery = undefined
    status.textContent = "Verificando a pasta…"
    const found =
      direction === "etterna-to-osu"
        ? await discoverEtternaSource(createBrowserSourceFiles(next))
        : undefined
    if (ticket !== epoch) return
    source = next
    sourceName = name
    discovery = found
    skin.replaceChildren(...(found?.skins ?? []).map((item) => option(item.path, item.name)))
    profile.replaceChildren(
      option("", "Valores padrão · sem perfil"),
      ...(found?.profileIds ?? []).map((id) => option(id, id)),
    )
    if (found?.profileIds[0]) profile.value = found.profileIds[0]
    element("selection", HTMLElement).textContent = `Pasta selecionada: ${name}`
    element("theme", HTMLElement).textContent = `Tema: ${found?.theme ?? ""}`
    element("options", HTMLElement).hidden = false
    review()
  } catch (cause) {
    if (ticket !== epoch) return
    error.hidden = false
    error.textContent = cause instanceof Error ? cause.message : "Não foi possível ler a pasta"
    status.textContent = "Selecione uma pasta válida."
    select.disabled = fallback.disabled = false
  }
}
select.onclick = async () => {
  if (!("showDirectoryPicker" in window) || typeof window.showDirectoryPicker !== "function") {
    folder.click()
    return
  }
  try {
    const picker = window.showDirectoryPicker as (options: {
      mode: "read"
    }) => Promise<ReadableDirectoryHandle>
    const handle = await picker({ mode: "read" })
    await accept({ kind: "directory-handle", handle }, handle.name)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") return
    error.hidden = false
    error.textContent =
      cause instanceof Error ? cause.message : "Não foi possível selecionar a pasta"
  }
}
fallback.onclick = () => folder.click()
folder.onchange = () => {
  const files = [...(folder.files ?? [])]
  folder.value = ""
  if (files.length)
    void accept({ kind: "file-list", files }, files[0]?.webkitRelativePath.split("/")[0] ?? "Skin")
}
skin.onchange = profile.onchange = density.onchange = review
convert.onclick = () => controller.convert()
async function clear() {
  ++epoch
  source = undefined
  discovery = undefined
  revoke()
  element("options", HTMLElement).hidden = true
  element("selection", HTMLElement).textContent = ""
  await controller.reset()
}
reset.onclick = () => void clear()
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="direction"]'))
  radio.onchange = () => {
    direction = radio.value as WebConversionRequest["direction"]
    element("source-title", HTMLElement).textContent =
      direction === "etterna-to-osu"
        ? "Selecione a instalação do Etterna"
        : "Selecione a pasta da skin osu!mania"
    element("source-help", HTMLElement).textContent =
      direction === "etterna-to-osu"
        ? "Escolha a pasta que contém NoteSkins e Save."
        : "Escolha a pasta que contém skin.ini e as imagens da skin."
    element("etterna-options", HTMLElement).hidden = direction !== "etterna-to-osu"
    element("osu-options", HTMLElement).hidden = direction !== "osu-to-etterna"
    element("manual-speed", HTMLElement).hidden = direction !== "osu-to-etterna"
    void clear()
  }
window.addEventListener("pagehide", () => {
  revoke()
  void controller.dispose()
})
async function initialize() {
  if (!isSecureContext || !("serviceWorker" in navigator)) {
    status.textContent =
      "Este navegador precisa de HTTPS e suporte a service worker. Use um navegador atualizado."
    return
  }
  if (!crossOriginIsolated) {
    status.textContent =
      "Preparando isolamento local. A página será recarregada uma vez antes da seleção."
    for (let attempt = 0; attempt < 100 && !crossOriginIsolated; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100))
    if (!crossOriginIsolated) {
      status.textContent =
        "Não foi possível habilitar o processamento local. Permita service workers e recarregue a página."
      return
    }
  }
  controller.initialize()
}
void initialize()
