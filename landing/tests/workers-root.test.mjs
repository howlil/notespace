import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const fromRoot = (path) => new URL(`../../${path}`, import.meta.url)
const rootWrangler = JSON.parse(readFileSync(fromRoot('wrangler.jsonc'), 'utf8'))
const nestedWrangler = JSON.parse(readFileSync(fromRoot('landing/wrangler.jsonc'), 'utf8'))
const pkg = JSON.parse(readFileSync(fromRoot('package.json'), 'utf8'))

test('Cloudflare root Wrangler deploys only built landing assets', () => {
  assert.equal(rootWrangler.name, nestedWrangler.name)
  assert.equal(rootWrangler.compatibility_date, nestedWrangler.compatibility_date)
  assert.equal(rootWrangler.assets.directory, './landing/dist')
  assert.equal(nestedWrangler.assets.directory, './dist')
  assert.equal(rootWrangler.main, undefined)
  assert.equal(rootWrangler.build, undefined, 'Workers Builds ignores wrangler.build.command')
  assert.ok(existsSync(fromRoot('landing/dist/index.html')), 'root build must output the Astro landing HTML')
})

test('existing root build retains the web build and also builds Astro from landing', () => {
  const build = pkg.scripts.build
  assert.match(build, /pnpm --filter @notespace\/web build/)
  assert.match(build, /pnpm --dir landing install --frozen-lockfile/)
  assert.match(build, /pnpm --dir landing build/)
  assert.equal(pkg.scripts.deploy, undefined, 'Cloudflare deploys using npx wrangler deploy directly')
})
