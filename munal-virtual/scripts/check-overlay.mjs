import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { CuratorOverlay } = await server.ssrLoadModule('/src/components/ui/CuratorOverlay.tsx')
  const { useGalleryStore } = await server.ssrLoadModule('/src/stores/useGalleryStore.ts')
  const data = JSON.parse(await readFile(new URL('../public/data/artworks.json', import.meta.url), 'utf8'))
  // SSR lee getInitialState: fixture local al proceso para cubrir los estados visuales.
  const initial = useGalleryStore.getInitialState()
  const saved = { ...initial }
  const props = { ready: true, locked: false, muted: false,
    onToggleSound() {}, onDismissNotice() {}, onRetry() {} }
  const render = (override = {}) => renderToStaticMarkup(createElement(CuratorOverlay, { ...props, ...override }))
  try {
    let html = render({ ready: false })
    assert.match(html, /Gabinete del Siglo XIX — MUNAL/)
    assert.match(html, /id="enter-gallery"[^>]*disabled/)
    html = render()
    assert.doesNotMatch(html, /id="enter-gallery"[^>]*disabled/)
    assert.match(render({ failure: new Error('Falta el modelo') }), /role="alert"/)
    assert.match(render({ muted: true }), /aria-pressed="true"/)
    Object.assign(initial, { isNearArtwork: true })
    html = render({ locked: true })
    assert.match(html, /Presiona <kbd>\[E\]<\/kbd> o haz clic para contemplar/)
    assert.match(html, /reticleActive/)
    assert.equal((html.match(/id="enter-gallery"/g) ?? []).length, 1, 'Botón persistente sin duplicados.')
    Object.assign(initial, { activeArtwork: data[0], isInspecting: true })
    html = render()
    assert.match(html, /<dialog[^>]*aria-labelledby="artwork-title"/)
    for (const label of ['Autor', 'Año', 'Técnica', 'Dimensiones']) assert.ok(html.includes(label))
    assert.match(html, /Continuar recorrido/)
    assert.doesNotMatch(html, /reticleActive/)
    assert.doesNotMatch(html, /loveLetter/)
    Object.assign(initial, { activeArtwork: data[6] })
    html = render()
    assert.match(html, /loveLetter/)
    assert.match(html, /Una carta, solo para ti/)
    assert.ok(html.includes(data[6].title))
    assert.ok(html.includes(data[6].description))
    Object.assign(initial, { activeArtwork: { ...data[0], title: '<script>alert(1)</script>' } })
    assert.ok(render().includes('&lt;script&gt;'), 'El contenido curatorial se escapa como texto.')
    console.log('OK: bienvenida, carga/error, retículo, ficha, carta, metadatos, escape de HTML y botón persistente (SSR).')
  } finally { Object.assign(initial, saved) }
} finally { await server.close() }
