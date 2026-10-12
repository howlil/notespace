import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const generated = new URL('../dist/index.html', import.meta.url)
const html = readFileSync(generated, 'utf8')

test('white hero makes the actual product message and Docker entrypoint visible', () => {
  assert.match(html, /Your notes and/)
  assert.match(html, /canvas/)
  assert.match(html, /href="#self-host"/)
  assert.match(html, /id="self-host"/)
  assert.match(html, /Open source/)
})

test('single production hero and preserved sections', () => {
  assert.equal((html.match(/id="hero-title"/g) ?? []).length, 1)
  for (const id of ['main-content', 'product', 'workflow', 'self-host']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`)
  }
  assert.doesNotMatch(html, /One workspace<br/)
})

test('demo mode, search and selection markup is emitted', () => {
  assert.match(html, /data-interactive="true"/)
  for (const mode of ['note', 'canvas', 'split']) {
    assert.ok(html.includes(`data-demo-mode="${mode}"`), `missing ${mode}`)
  }
  assert.match(html, /data-demo-overlay/)
  assert.match(html, /data-demo-query/)
  assert.match(html, /data-demo-search-text/)
  assert.match(html, /data-demo-selection/)
  assert.match(html, /aria-label="Workspace preview mode"/)
  assert.match(html, /example content, no backend connection/)
})

test('CSS and standalone Astro product script are bundled', () => {
  assert.ok(existsSync(new URL('../dist/_astro', import.meta.url)), 'Astro assets are missing')
  assert.ok(html.includes('<script'), 'generated page has no client-side script')
})
