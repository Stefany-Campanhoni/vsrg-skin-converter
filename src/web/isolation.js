// Only this non-personal bootstrap marker is stored; selections never survive reloads.
window.coi = {
  quiet: true,
  coepCredentialless: () => false,
  doReload: async () => {
    if (sessionStorage.getItem("vsrg-isolation-reload")) return
    sessionStorage.setItem("vsrg-isolation-reload", "1")
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      )
    location.reload()
  },
}
if (crossOriginIsolated) sessionStorage.removeItem("vsrg-isolation-reload")
