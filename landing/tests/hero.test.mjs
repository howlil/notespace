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
  assert.match(html, /Download for Windows/)
  assert.match(html, /See how it works/)
  assert.doesNotMatch(html, /Sign in|Join for Free/)
})

test('navbar uses the canonical Notespace Foldling brand asset', () => {
  const officialLogo = new URL('../public/brand/notespace-foldling.svg', import.meta.url)
  assert.ok(existsSync(officialLogo), 'canonical Notespace logo asset missing')
  assert.match(html, /class="ns-ambient-brand-icon" src="\/brand\/notespace-foldling\.svg"/)
  assert.doesNotMatch(html, /viewBox="0 0 29 33"/)
})

test('panorama asset and one heading with preserved landing sections', () => {
  assert.equal((html.match(/id="hero-title"/g) ?? []).length, 1)
  assert.ok(existsSync(new URL('../dist/notespace-ambient-hero.webp', import.meta.url)), 'panorama asset missing')
  assert.match(html, /src="\/notespace-ambient-hero\.webp"/)
  for (const id of ['main-content', 'product', 'workflow', 'self-host']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`)
  }
})

test('panorama frame maintains symmetric gutters and rounded corners', () => {
  const css = readFileSync(new URL('../src/styles/white-hero.css', import.meta.url), 'utf8')
  const shell = css.match(/\.ns-ambient-shell\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(shell, /padding-inline:\s*clamp\(/, 'both desktop gutters should share one spacing rule')
  assert.doesNotMatch(shell, /padding-(?:left|right)\s*:/, 'single-sided padding would unbalance the hero image')

  const art = css.match(/\.ns-ambient-art\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(art, /border-radius:\s*18px/, 'desktop panorama should have noticeable rounded corners')
  assert.match(art, /overflow:\s*hidden/, 'frame should clip the image at all corners')
  assert.match(css, /\.ns-ambient-art img\s*\{[^}]*border-radius:\s*inherit/, 'image should inherit the clipping radius')

  const mobile = css.split('@media(max-width:720px) {')[1] ?? ''
  assert.match(mobile, /\.ns-ambient-shell\s*\{[^}]*padding-inline:\s*17px/, 'mobile gutters must stay symmetrical')
  assert.match(mobile, /\.ns-ambient-art\s*\{[^}]*border-radius:\s*12px/, 'mobile corners should remain rounded')
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

test('desktop download CTAs offer the real published MSI instead of a GitHub navigation', () => {
  const expected = 'https://github.com/howlil/notespace/releases/download/v0.1.0-beta.1/Notespace_0.1.0-beta.1_x64_en-US.msi'
  const anchors = [...html.matchAll(/<a\b[^>]*\bdata-notespace-windows-download\b[^>]*>/g)]
  assert.equal(anchors.length, 4, 'header, hero, mobile and bottom CTA must download Windows MSI')
  for (const match of anchors) {
    assert.ok(match[0].includes(`href="${expected}"`), 'All CTA links need a known-good direct MSI fallback')
    assert.doesNotMatch(match[0], /target="_blank"/, 'Installer should download without a stray new browser tab')
  }
  assert.match(html, /data-notespace-windows-version/)
  assert.match(html, /Windows 64-bit/)
  assert.match(html, /Unsigned installer/)
  assert.doesNotMatch(html, /href="#self-host"[^>]*>\s*Get Notespace/)
})
