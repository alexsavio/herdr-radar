'use strict';

// A worktree's corner says "cut from the project above". In the plugin's own
// order that is always true, because the family key holds a family in one
// block. In Herdr's order (`order = off`) a worktree opened later is appended
// to the end of the list, and the corner would hang it off whichever project
// sits above it (#54). Such a worktree is drawn detached: a top-level row with
// its worktree mark, no tee into a stranger, and no repo row of its own, since
// the repo is already on the panel as the real parent (#62).

const test = require('node:test');
const assert = require('node:assert/strict');

const herdr = require('../lib/herdr');
const state = require('../lib/state');
const { Frame } = require('../lib/frame');

// Herdr's workspace order from the reports: app, its first worktree, an
// unrelated project, a worktree of app opened later, another project.
const entries = ['app', 'feature', 'other', 'hotfix', 'scratch'].map((ws) => ({
  pane: `${ws}:p1`,
  workspace: ws,
  tab: `${ws}:t1`,
  name: 'claude',
  title: 'x',
}));
const parents = new Map([
  ['feature', 'app'],
  ['hotfix', 'app'],
]);
const worktrees = new Map([
  ['feature', 'app'],
  ['hotfix', 'app'],
]);

function treeFor(viewMode, list = entries) {
  const frame = new Frame('test');
  const ranks = frame.sortKeys(list, parents, worktrees);
  const displayEntries = frame.displayOrder(list, viewMode, ranks);
  return { tree: frame.strayWorktrees(displayEntries, ranks), displayEntries };
}

async function groupsFor(t, list, tree) {
  const sent = new Map();
  t.mock.method(herdr, 'reportMetadataAsync', async (pane, _source, tokens) => {
    // A group write is split across reports (reportChunked); keep every chunk.
    sent.set(pane, { ...sent.get(pane), ...tokens });
    return true;
  });
  const labels = new Map(list.map((entry) => [entry.workspace, entry.workspace]));
  await state.writeGroups('test', list, labels, new Set(), {
    parentOf: tree.parentOf,
    orphanRepo: tree.orphanRepo,
    detached: tree.detached,
  });
  return sent;
}

test('in Herdr order a worktree away from its family is detached, not orphaned', () => {
  const { tree } = treeFor(null);
  assert.equal(tree.parentOf.get('feature'), 'app', 'the worktree under its parent keeps the tree');
  assert.equal(tree.parentOf.has('hotfix'), false, 'the stray is no longer a child');
  assert.equal(tree.detached.has('hotfix'), true, 'it is drawn detached');
  assert.equal(tree.orphanRepo.has('hotfix'), false, 'its parent is listed, so it is no orphan');
  assert.equal(tree.nested('hotfix'), false, 'and it sits at the top level');
});

test('in the plugin order a family is one block, so nothing is detached', () => {
  const { tree, displayEntries } = treeFor('grouped');
  const order = [...new Set(displayEntries.map((entry) => entry.workspace))];
  const family = ['app', 'feature', 'hotfix'].map((ws) => order.indexOf(ws)).sort((a, b) => a - b);
  assert.equal(family[2] - family[0], 2, `the family is contiguous in ${order.join(', ')}`);
  assert.equal(tree.parentOf.get('hotfix'), 'app');
  assert.equal(tree.detached.size, 0);
});

test('writeGroups draws the stray with no tee and no second copy of its repo', async (t) => {
  const { tree } = treeFor(null);
  const sent = await groupsFor(t, entries, tree);
  assert.match(sent.get('feature:p1').group, /[├└]─ /, 'the attached worktree keeps its corner');
  assert.doesNotMatch(sent.get('hotfix:p1').group, /[├└]─/, 'no corner into the project above');
  assert.equal(sent.get('hotfix:p1').group_parent, null, 'no repo row: app is already on the panel');
  const parentRows = [...sent.values()].filter((tokens) => tokens.group === 'app' || tokens.group_parent === 'app');
  assert.equal(parentRows.length, 1, 'app appears once');
  assert.equal(sent.get('other:p1').group_parent, null, 'the project above is left alone');
});

test('a worktree whose parent is not listed still gets its repo row', async (t) => {
  const list = entries.filter((entry) => entry.workspace !== 'app');
  const { tree } = treeFor(null, list);
  assert.equal(tree.orphanRepo.get('hotfix'), 'app');
  assert.equal(tree.detached.has('hotfix'), false);
  const sent = await groupsFor(t, list, tree);
  assert.equal(sent.get('hotfix:p1').group_parent, 'app', 'the repo name stands in for the absent parent');
});

// A detached row is drawn apart from its family, but it still belongs to it:
// the colour says which group, so it follows the owner even where the tree
// cannot. `owner` children are hung the same way as worktrees.
test('in Herdr order a detached member keeps its group colour', async (t) => {
  const config = require('../lib/config');
  const activity = require('../lib/activity');
  const view = require('../lib/view');
  const previous = { groupColors: config.groupColors, groupHeaders: config.groupHeaders };
  config.groupColors = true;
  config.groupHeaders = true;
  t.after(() => Object.assign(config, previous));

  const order = ['app', 'other', 'kid1', 'kid2'];
  const list = order.map((ws, index) => ({
    pane: `${ws}:p1`,
    terminal: `t${index}`,
    workspace: ws,
    tab: `${ws}:t1`,
    name: 'claude',
    title: 'x',
    status: 'idle',
  }));
  const owners = new Map([
    ['kid1', 'app'],
    ['kid2', 'app'],
  ]);
  t.mock.method(state, 'snapshot', async () => list);
  t.mock.method(state, 'labels', async () => ({
    tabs: new Map(),
    workspaces: new Map(order.map((ws) => [ws, ws])),
    parents: owners,
    worktrees: new Map(),
  }));
  t.mock.method(view, 'mode', () => null);
  t.mock.method(herdr, 'panelGrouped', () => true);
  t.mock.method(herdr, 'panesAsync', async () => []);
  t.mock.method(herdr, 'workspacesAsync', async () => []);
  t.mock.method(activity, 'load', () => new Map());
  t.mock.method(activity, 'save', () => {});
  t.mock.method(activity, 'recover', () => null);
  const sent = new Map();
  t.mock.method(herdr, 'reportMetadataAsync', async (pane, _source, tokens) => {
    sent.set(pane, { ...sent.get(pane), ...tokens });
    return true;
  });

  const frame = new Frame('test');
  await frame.render(10_000_000);
  const slotOf = (ws) => state.GROUP_COLOR_TOKENS.findIndex((token) => sent.get(`${ws}:p1`)?.[token]);
  assert.notEqual(slotOf('app'), -1, 'the owner header is coloured');
  assert.equal(slotOf('kid1'), slotOf('app'), 'a detached member wears its owner colour');
  assert.equal(slotOf('kid2'), slotOf('app'), 'and so does its sibling');
  assert.notEqual(slotOf('other'), slotOf('app'), 'the project between them keeps its own');
  const header = sent.get('kid1:p1')[state.GROUP_COLOR_TOKENS[slotOf('kid1')]];
  assert.ok(!header.includes(config.worktreeMark), 'an owner member is no worktree and has no mark');
});
