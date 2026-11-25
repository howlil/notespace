import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles/showcase.css', import.meta.url), 'utf8')

// Visible copy: scripts and styles removed, tags dropped, entities decoded.
const copy = html
  .slice(html.indexOf('<body'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replaceAll('&amp;', '&')
  .replace(/\s+/g, ' ')

const MSI = 'https://github.com/howlil/notespace/releases/download/v1.0.3/Notespace_1.0.3_x64_en-US.msi'
const SECTIONS = ['code', 'diagrams', 'notes', 'saving', 'library', 'backup', 'themes', 'features', 'windows', 'self-host']
const productDir = new URL('../public/product/', import.meta.url)
const appDir = fileURLToPath(new URL('../../apps/web/src/', import.meta.url))
const globalsPath = join(appDir, 'shared', 'styles', 'globals.css')

// Control and state names the copy uses. Each must appear in the copy and in the app's own source.
const APP_LABELS = [
  'Undo', 'Redo', 'Fit canvas', 'Object snapping', 'Selection toolbar', 'Floating', 'Compact', 'Docked',
  'General Components', 'Connect', 'Place existing Note', 'Info & backlinks', 'Move to Trash',
  'Remove instance', 'Extract to Note', 'LaTeX',
  'Run JavaScript', 'Preview HTML', 'Show code output', 'Copy code', 'Code language', 'Code theme',
  'Line numbers', 'Fit to content', 'Duplicate code block', 'Delete code block',
  'Categories', 'Explorer', 'Previous', 'Next', 'Quick Open', 'Trash', 'Restore a Workspace or Note',
  'Delete permanently', 'Export ZIP', 'Restore backup', 'Includes Workspaces, Canvas content, images, Trash, and history.',
  'Restoring a backup replaces your current library.', 'Retry merged save', 'Download draft',
  'Use saved Canvas', 'Keep editing', 'Device recovery snapshots are available in the Windows desktop app.',
  'System', 'Light', 'Dark', 'Color theme', 'Paper', 'Stone', 'Sage', 'Amber', 'Graphite',
  'Saved in this browser', 'Saved on this device',
]

// Pixel size from the WebP header: simple (VP8), extended (VP8X) or lossless (VP8L) container.
function webpSize(bytes) {
  const type = bytes.toString('ascii', 12, 16)
  if (type === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)]
  if (type === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
  if (type === 'VP8L') {
    const bits = bytes.readUInt32LE(21)
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
  }
  throw new Error(`unknown WebP chunk "${type}"`)
}

// Source of every app component and style file, tests excluded, so each label is checked where the UI defines it.
function readAppSource(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return readAppSource(path)
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? readFileSync(path, 'utf8') : ''
    })
    .join('\n')
}

test('hero names the product, both installs and the real canvas', () => {
  assert.match(html, /<h1 id="hero-title">Write, draw, and run code on one canvas\.<\/h1>/)
  assert.match(copy, /Install the Windows app, or run your own server\./)
  assert.match(html, /href="#self-host"/)
  assert.match(html, /<img src="\/product\/canvas\.webp"/)
})

test('sections appear once, in scroll order, numbered 01 to 08 where numbered', () => {
  const positions = SECTIONS.map((id) => {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1, `#${id} must appear once`)
    return html.indexOf(`id="${id}"`)
  })
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  const numbers = [...html.matchAll(/<p class="nx-num" aria-hidden="true">(\d\d)<\/p>/g)].map((m) => m[1])
  assert.deepEqual(numbers, ['01', '02', '03', '04', '05', '06', '07', '08', '09'])
})

test('each section header keeps one heading and one line of copy', () => {
  for (const [, body] of html.matchAll(/<header class="nx-head">([\s\S]*?)<\/header>/g)) {
    assert.ok((body.match(/<p>/g) ?? []).length <= 1, 'a section header has more than one line of copy')
  }
})

test('every screenshot is a real 2160x1350 capture with a descriptive alt', () => {
  const images = [...html.matchAll(/<img src="\/product\/([^"]+)"([^>]*)>/g)]
  assert.equal(images.length, 10, 'ten app captures')
  for (const [, file, attrs] of images) {
    const bytes = readFileSync(new URL(file, productDir))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file)
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file)
    assert.deepEqual(webpSize(bytes), [2160, 1350], file)
    assert.match(attrs, /width="2160" height="1350"/, file)
    const alt = attrs.match(/alt="([^"]*)"/)?.[1] ?? ''
    assert.ok(alt.length >= 40 && !/screenshot|image of/i.test(alt), `${file} needs a descriptive alt`)
  }
  for (const file of readdirSync(productDir)) {
    assert.ok(html.includes(`/product/${file}`), `${file} is shipped but not shown`)
  }
})

test('copy names only shipped capability', () => {
  assert.doesNotMatch(copy, /Notes page|Notes app|Split View|Focus Mode|Tiptap|Markdown|Sixteen languages/)
  assert.doesNotMatch(copy, /\bAI\b|Sign in|open source|Join for Free|Get started free/i)
  assert.doesNotMatch(copy, /↗/)
  // Present in the tool catalog, but their behavior is not verified, so the page must not claim them.
  assert.doesNotMatch(copy, /magic frame|auto shape/i)
})

test('every control name in the copy is spelled as the app spells it', { skip: !existsSync(appDir) }, () => {
  const source = readAppSource(appDir).replaceAll('&amp;', '&')
  const misses = APP_LABELS
    .map((label) => ({ label, inCopy: copy.includes(label), inApp: source.includes(label) }))
    .filter(({ inCopy, inApp }) => !inCopy || !inApp)
  assert.deepEqual(misses, [], 'every label must appear in the copy and in apps/web/src')
})

test('the behavior claims trace to the app code', { skip: !existsSync(appDir) }, () => {
  const read = (file) => readFileSync(join(appDir, file), 'utf8')
  assert.match(read('features/workspace-authoring/canvas/code/preview/HtmlPreviewFrame.tsx'), /sandbox="allow-scripts"/)
  assert.match(read('features/workspace-authoring/canvas/code/execution/code-runner.ts'), /new Worker\(/)
  assert.match(read('features/workspace-authoring/canvas/sync/use-canvas-peer-channel.ts'), /new BroadcastChannel\(/)
})

test('every Windows download CTA links the verified MSI in the same tab', () => {
  const anchors = [...html.matchAll(/<a\b[^>]*\bdata-notespace-windows-download\b[^>]*>/g)].map((m) => m[0])
  assert.equal(anchors.length, 5, 'nav, hero, mobile menu, Windows section and closing CTA')
  for (const tag of anchors) {
    assert.ok(tag.includes(`href="${MSI}"`), 'every CTA needs the known-good MSI fallback')
    assert.doesNotMatch(tag, /target="_blank"/)
  }
  assert.match(html, /data-notespace-windows-version/)
  assert.match(copy, /Unsigned installer/)
  assert.match(copy, /Unknown Publisher/)
  assert.doesNotMatch(html, /v0\.1\.0-beta\.1/, 'the stale beta fallback must not ship')
})

test('mobile menu starts closed and controls its panel', () => {
  assert.match(html, /<button class="nx-menu" type="button" aria-controls="nx-mobile" aria-expanded="false">/)
  assert.match(html, /<nav class="nx-mobile" id="nx-mobile" aria-label="Mobile" hidden>/)
  assert.ok(html.includes('<script'), 'client scripts missing')
})

test('self-host commands and claims match the README', { skip: !existsSync(new URL('../../README.md', import.meta.url)) }, () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
  for (const command of [
    'git clone https://github.com/howlil/notespace.git',
    'cd notespace',
    'docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait',
    'http://localhost:8080',
  ]) {
    assert.ok(readme.includes(command), `README lacks "${command}"`)
    assert.ok(html.includes(command), `landing lacks "${command}"`)
  }
  for (const claim of ['NOTESPACE_PASSWORD', 'notespace-data', '/api/health']) {
    assert.ok(readme.includes(claim), `README lacks ${claim}`)
    assert.ok(html.includes(claim), `landing lacks ${claim}`)
  }
})

test('showcase styles stay flat, scoped and honor reduced motion', () => {
  assert.doesNotMatch(css, /box-shadow|text-shadow|drop-shadow|backdrop-filter|filter\s*:/, 'no shadows, blur or filters')
  assert.doesNotMatch(css, /overflow-x:\s*hidden/, 'overflow must be fixed, not hidden')
  assert.doesNotMatch(css, /^:root\b/m, 'global :root tokens must stay untouched')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.nx \[hidden\]\s*\{[^}]*display:\s*none !important/)
})

test('navbar and footer use the canonical brand asset, and the accent is the app Paper accent', () => {
  assert.ok(existsSync(new URL('../public/brand/notespace-fox-head.svg', import.meta.url)), 'canonical logo missing')
  assert.match(html, /src="\/brand\/notespace-fox-head\.svg"/)
  if (!existsSync(globalsPath)) return
  const accent = readFileSync(globalsPath, 'utf8').match(/:root\s*\{[^}]*--accent:\s*([^;]+);/)?.[1]?.trim()
  assert.ok(accent, 'globals.css defines --accent for :root')
  assert.ok(css.includes(`--nx-accent: ${accent};`), 'the landing accent must equal the app Paper accent')
})
