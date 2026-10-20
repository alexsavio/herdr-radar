'use strict';

// The fork's grouping: `owner` tokens, git worktrees and the colour stripe,
// as writeGroups draws them.

const test = require('node:test');
const assert = require('node:assert/strict');

const herdr = require('../lib/herdr');
const state = require('../lib/state');

function record(t) {
  const sent = new Map();
  t.mock.method(herdr, 'reportMetadataAsync', async (pane, _source, tokens) => {
    sent.set(pane, { ...sent.get(pane), ...tokens });
    return true;
  });
  return sent;
}

// An orphan's repo name is the entry's first row and its header the second,
// which Herdr already hangs by two columns. Only the first row takes the lead.
test('an orphan header stripe lines up with the rows under it', async (t) => {
  const sent = record(t);
  const entries = [{ pane: 'wt:p1', workspace: 'wt' }];
  await state.writeGroups('test', entries, new Map([['wt', 'feature']]), new Set(), {
    orphanRepo: new Map([['wt', 'app']]),
    colorOf: new Map([['wt', 0]]),
  });
  const tokens = sent.get('wt:p1');
  assert.equal(tokens.band_parent, state.bandValue(0, '', { firstRow: true }), 'the repo row is a first row');
  assert.equal(tokens.band_head, state.bandValue(0, '', { firstRow: false }), 'the header is a continuation row');
});
