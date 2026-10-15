import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const generated = new URL('../dist/index.html', import.meta.url)
const html = readFileSync(generated, 'utf8')

test('approved ambient hero is emitted with truthful self-hosted copy and accessible actions', () => {
  assert.match(html, /Own your thinking\./)
  assert.match(html, /Shape ideas\. Build a calmer/)
  assert.match(html, /knowledge system\./)
  assert.match(html, /notes, connect ideas visually/)
  assert.match(html, /href="#self-host"/)
  assert.match(html, /Get Notespace/)
  assert.match(html, /See how it works/)
  assert.doesNotMatch(html, /Sign in|Join for Free/)
})

test('panorama asset and one heading with preserved landing sections', () => {
  assert.equal((html.match(/id="hero-title"/g) ?? []).length, 1)
  assert.ok(existsSync(new URL('../dist/notespace-ambient-hero.webp', import.meta.url)), 'panorama asset missing')
  assert.match(html, /src="\/notespace-ambient-hero\.webp"/)
  for (const id of ['main-content', 'product', 'workflow', 'self-host']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`)
  }
})

test('responsive navigation has accessible toggle and ships a client script', () => {
  assert.match(html, /aria-controls="notespace-mobile-navigation"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /data-open="false"/)
  assert.ok(existsSync(new URL('../dist/_astro', import.meta.url)), 'Astro assets are missing')
  assert.ok(html.includes('<script'), 'mobile navigation client script missing')
})

test('Cloudflare deployment is scoped to Astro landing build', () => {
  const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const landing = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(wrangler.name, 'notespace-landing')
  assert.equal(wrangler.assets.directory, './dist')
  assert.equal(wrangler.main, undefined)
  assert.equal(landing.scripts.build, 'astro build')
  assert.ok(root.scripts.build.includes('pnpm --filter @notespace/web build'))
  assert.match(root.scripts.build, /pnpm --dir landing build/)
  assert.equal(landing.scripts.deploy, undefined)
})
