import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles/showcase.css', import.meta.url), 'utf8')

// Visible copy: scripts and styles removed, and the entity Astro escapes in labels decoded.
const copy = html
  .slice(html.indexOf('<body'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replaceAll('&amp;', '&')

test('hero leads with the product promise and the self-hosted SQLite claim', () => {
  assert.match(copy, /Draw it\. Run it\./)
  assert.match(copy, /Own it\./)
  assert.match(html, /A self-hosted canvas for diagrams, sketches, images and runnable code/)
  assert.match(copy, /Everything stays in one SQLite file you control\./)
  assert.equal((html.match(/id="hero-title"/g) ?? []).length, 1)
  assert.match(html, /href="#self-host"/)
})

test('every feature section is emitted exactly once with a stable anchor', () => {
  for (const id of ['canvas', 'library', 'saving', 'vault', 'desktop', 'self-host']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1, `missing or duplicate #${id}`)
  }
})

test('copy describes shipped capability, not retired or unshipped surfaces', () => {
  // Notes, Split View and Focus Mode are retired; Canvas Note cards are not shipped (#203).
  assert.doesNotMatch(copy, /\bNotes?\b/)
  assert.doesNotMatch(copy, /Split View|Focus Mode|Tiptap|Markdown|Sixteen languages/)
  // Notespace has no AI features; the landing must not imply any.
  assert.doesNotMatch(copy, /\bAI\b/)
  assert.doesNotMatch(copy, /Sign in|Join for Free|Get started free|Free (?:plan|tier|beta|forever)|open source/i)
  assert.doesNotMatch(copy, /↗/)
})

test('feature claims match the verified app and README wording', () => {
  assert.match(copy, /Saved means SQLite confirmed it\./)
  assert.match(copy, /same workspace open in two tabs of one browser stays in sync/)
  assert.match(copy, /JavaScript runs in a worker/)
  assert.match(copy, /sandboxed frame/)
  assert.match(copy, /notespace-backup\.zip/)
  assert.match(copy, /all-or-nothing/)
  assert.match(copy, /Unknown Publisher/)
})

test('navbar and footer use the canonical Notespace Fox Spirit brand asset', () => {
  assert.ok(existsSync(new URL('../public/brand/notespace-fox-head.svg', import.meta.url)), 'canonical logo missing')
  assert.match(html, /src="\/brand\/notespace-fox-head\.svg"/)
})

test('every Windows download CTA links the verified MSI without a stray new tab', () => {
  const expected = 'https://github.com/howlil/notespace/releases/download/v0.1.0-beta.1/Notespace_0.1.0-beta.1_x64_en-US.msi'
  const anchors = [...html.matchAll(/<a\b[^>]*\bdata-notespace-windows-download\b[^>]*>/g)]
  assert.equal(anchors.length, 5, 'nav, hero, mobile menu, desktop and closing CTAs must download the MSI')
  for (const match of anchors) {
    assert.ok(match[0].includes(`href="${expected}"`), 'every CTA needs the known-good direct MSI fallback')
    assert.doesNotMatch(match[0], /target="_blank"/)
  }
  assert.match(html, /data-notespace-windows-version/)
  assert.match(copy, /Unsigned installer/)
})

test('responsive navigation keeps an accessible toggle and ships client scripts', () => {
  assert.match(html, /aria-controls="nsx-mobile-nav"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /id="nsx-mobile-nav"[^>]*data-open="false"/)
  assert.ok(existsSync(new URL('../dist/_astro', import.meta.url)), 'Astro assets are missing')
  assert.ok(html.includes('<script'), 'client scripts missing')
})

test('showcase styles stay flat, scoped and honor reduced motion', () => {
  assert.doesNotMatch(css, /box-shadow|text-shadow|drop-shadow|backdrop-filter|filter\s*:/, 'no shadows, blur or filters')
  assert.doesNotMatch(css, /marquee/)
  assert.doesNotMatch(css, /overflow-x:\s*hidden/)
  assert.doesNotMatch(css, /^:root\b/m, 'global :root tokens must stay untouched')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.nsx-app \.nsx-pen\s*\{[^}]*animation:/)
  assert.match(css, /\.nsx \[hidden\]\s*\{[^}]*display:\s*none !important/)
  assert.match(css, /:where\(\.nsx button\)/)
})

// Every label the mocks show is copied from the app source file that defines it.
const appRoot = new URL('../../apps/web/src/', import.meta.url)
const appLabels = [
  ['features/workspace-authoring/session/CanvasConflictRecovery.tsx', [
    'Recover Canvas changes',
    'Your Canvas changed elsewhere. Download your current draft, or retry merging it with the latest saved Canvas.',
    'Using the saved Canvas removes your unsaved local changes. Download your draft first if you want to keep a copy.',
    'Retry merged save',
    'Download draft',
    'Use saved Canvas',
    'Discard local and use saved',
    'Keep editing',
  ]],
  ['pages/workspace/WorkspacePage.tsx', ['Saved', 'Saving…', 'Unsaved']],
  ['features/library/backup/LibraryTools.tsx', [
    'Portable library backup',
    'Includes Workspaces, Canvas content, images, Trash, and history.',
    'Export ZIP',
    'Restore backup',
    'Restoring a backup replaces your current library.',
    'Trash',
  ]],
  ['features/settings/AppSettings.tsx', [
    'Settings',
    'Preferences and data',
    'General',
    'Data & backup',
    'Appearance',
    'Change the look of Notespace.',
    'Theme',
    'Light mode',
    'Library storage',
    'Saved on this device',
  ]],
  ['features/workspace-authoring/canvas/code/CanvasCodeBlockActions.tsx', [
    'Run JavaScript',
    'Hide code output',
    'Show code output',
    'Copy code',
    'More code actions',
    'Preview HTML',
    'Search languages',
    'Auto / Detect language',
    'Executable',
    'HTML preview',
    'Source / highlighting',
    'Code language',
  ]],
  ['domain/code/code-language.ts', ['JavaScript', 'TypeScript', 'Python', 'HTML / XML']],
  ['features/search/QuickOpen.tsx', ['Open workspace or category…', 'Recent workspaces', 'Search results']],
  ['features/library/collection/WorkspaceLibrary.tsx', ['Workspace pages', 'Previous', 'Next']],
  ['features/library/explorer/LibrarySidebar.tsx', ['Categories']],
  ['features/workspace-authoring/canvas/diagram/palette/DiagramPalette.tsx', ['Search diagram components']],
  ['domain/diagram/catalog/diagram-catalog.ts', [
    'Browser', 'Server', 'Redis', 'PostgreSQL', 'Queue', 'Lambda', 'S3', 'Kubernetes', 'Docker',
  ]],
]


test('mock labels are copied from the app source', { skip: !existsSync(appRoot) }, () => {
  for (const [file, labels] of appLabels) {
    const source = readFileSync(new URL(file, appRoot), 'utf8').replaceAll('&amp;', '&')
    for (const label of labels) {
      // Some labels render only after a click, so the inline client script in the page counts too.
      assert.ok(copy.includes(label) || html.includes(label), `landing does not show "${label}"`)
      assert.ok(source.includes(label), `"${label}" is not in apps/web/src/${file}`)
    }
  }
})

test('self-host commands match the README', { skip: !existsSync(new URL('../../README.md', import.meta.url)) }, () => {
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
  assert.ok(readme.includes('NOTESPACE_PASSWORD'))
  assert.ok(html.includes('NOTESPACE_PASSWORD'))
})
