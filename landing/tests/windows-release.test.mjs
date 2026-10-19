import assert from 'node:assert/strict'
import test from 'node:test'
import { latestWindowsInstaller } from '../src/lib/windows-release.mjs'

function release(tag, timestamp = '2026-10-19T12:14:18Z', options = {}) {
  const version = tag.replace(/^v/, '')
  const filename = `Notespace_${version}_x64_en-US.msi`
  return {
    tag_name: tag,
    published_at: timestamp,
    prerelease: version.includes('-beta.'),
    draft: false,
    assets: [{
      name: filename,
      state: 'uploaded',
      browser_download_url: `https://github.com/howlil/notespace/releases/download/${tag}/${filename}`,
    }],
    ...options,
  }
}

test('resolves the actual first unsigned Windows beta directly, not a releases page', () => {
  assert.deepEqual(latestWindowsInstaller([release('v0.1.0-beta.1')]), {
    url: 'https://github.com/howlil/notespace/releases/download/v0.1.0-beta.1/Notespace_0.1.0-beta.1_x64_en-US.msi',
    version: '0.1.0-beta.1',
    publishedTime: Date.parse('2026-10-19T12:14:18Z'),
    stable: false,
  })
})

test('tracks newest published Windows MSI even when it is a prerelease', () => {
  const result = latestWindowsInstaller([
    release('v0.1.0-beta.1'),
    release('v0.1.0-beta.2', '2026-10-21T00:00:00Z'),
  ])
  assert.equal(result.version, '0.1.0-beta.2')
})

test('selects published stable MSI when a newer signed stable version ships', () => {
  const result = latestWindowsInstaller([
    release('v0.1.0-beta.3', '2026-10-19T00:00:00Z'),
    release('v0.1.0', '2026-10-22T00:00:00Z'),
  ])
  assert.equal(result.version, '0.1.0')
})

test('rejects draft, missing, uploaded-incomplete, external-host and fabricated assets', () => {
  const draft = release('v0.1.0-beta.3', '2026-10-23T00:00:00Z', { draft: true })
  const missing = release('v0.1.0-beta.4', '2026-10-24T00:00:00Z', { assets: [] })
  const incomplete = release('v0.1.0-beta.5', '2026-10-25T00:00:00Z')
  incomplete.assets[0].state = 'starter'
  const external = release('v0.1.0-beta.6', '2026-10-26T00:00:00Z')
  external.assets[0].browser_download_url = 'https://attacker.example/malware.msi'
  const fabricated = release('v0.1.0-beta.7', '2026-10-27T00:00:00Z')
  fabricated.assets[0].name = 'OtherApp_0.1.0-beta.7_x64_en-US.msi'
  assert.equal(latestWindowsInstaller([draft, missing, incomplete, external, fabricated]), null)
})

test('does not trust malformed GitHub API metadata', () => {
  assert.equal(latestWindowsInstaller(null), null)
  assert.equal(latestWindowsInstaller({ releases: [] }), null)
  assert.equal(latestWindowsInstaller([
    release('v0.1.0-beta.1', 'not-a-date'),
    release('master', '2026-10-19T12:14:18Z'),
    release('v0.1.0-beta.2', null),
  ]), null)
})
