'use strict';

// The daemon rewrites the sidebar block on start when it is not the one this
// version writes. A block from before the group colours has no `$group_cN`
// cell, so every coloured group header published into it draws nothing — and
// its logo variant, tab-bar block and row widths all still pass, so nothing
// else on the start path notices.
//
// The other half matters as much: a block apply() has just written must never
// read as stale, or every start rewrites config.toml and reloads Herdr.
//
// Herdr's verdict and the desktop's appearance are replaced here; Herdr's
// config, its detector cache and the plugin's state live in a directory of
// their own for this process.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-sidebar-stale-'));
process.env.HERDR_RADAR_STATE = path.join(sandbox, 'state');
process.env.XDG_CONFIG_HOME = path.join(sandbox, 'config');
process.env.XDG_STATE_HOME = path.join(sandbox, 'herdr-state');

const test = require('node:test');
const assert = require('node:assert/strict');

const herdr = require('../lib/herdr');
const appearance = require('../lib/appearance');
const logos = require('../lib/logos');
const identity = require('../lib/identity');
const managed = require('../lib/managed-config');

const file = path.join(sandbox, 'config', 'herdr', 'config.toml');
const BEFORE = '[ui]\n\n[theme]\nname = "catppuccin-latte"\n';

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

// A fresh install for this appearance, read back the way the daemon reads it.
function installed(t, variant) {
  t.mock.method(herdr, 'configCheck', () => ({ parses: true, ok: true, output: 'config: ok' }));
  t.mock.method(appearance, 'current', () => variant);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, BEFORE);
  assert.equal(managed.apply().ok, true);
  return fs.readFileSync(file, 'utf8');
}

function withoutGroupColours(text) {
  const stripped = text.replace(/, \{ token = "\$group_c\d+"[^}]*\}/g, '');
  assert.notEqual(stripped, text, 'the block has no $group_cN cell to take out');
  return stripped;
}

for (const variant of ['light', 'dark']) {
  test(`a block apply() just wrote is not stale (${variant})`, (t) => {
    installed(t, variant);
    assert.equal(managed.sidebarStale(managed.inspect().text), false);
  });

  test(`a block without the group colour cells is stale (${variant})`, (t) => {
    fs.writeFileSync(file, withoutGroupColours(installed(t, variant)));
    const { text } = managed.inspect();
    // What the start check looked at before: all of it still passes.
    assert.equal(managed.blockVariant(text), logos.resolveVariant());
    assert.equal(managed.tabBarStale(text), false);
    assert.equal(managed.blockOverLimit(text), false);
    assert.equal(managed.sidebarStale(text), true);
  });
}

test('a block under a previous name of the plugin is stale when its content is old', (t) => {
  const current = identity.markers('sidebar');
  const legacy = identity.markers('sidebar', identity.LEGACY_NAMES[0]);
  const old = withoutGroupColours(installed(t, 'light'))
    .replace(current.start, legacy.start)
    .replace(current.end, legacy.end);
  fs.writeFileSync(file, old);
  assert.equal(managed.sidebarStale(managed.inspect().text), true);
});

// The Agents panel handed back to Herdr is recorded by the block's absence;
// reading that as stale would put the plugin's rows back on the next start.
test('no sidebar block is never stale', (t) => {
  installed(t, 'light');
  assert.equal(managed.setSidebarRows(false).changed, true);
  const { text } = managed.inspect();
  assert.equal(text.includes(managed.SIDEBAR_START), false);
  assert.equal(managed.sidebarStale(text), false);
  assert.equal(managed.sidebarStale('[ui]\n'), false);
});
