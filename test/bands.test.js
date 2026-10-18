'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const palette = require('../lib/palette');
const state = require('../lib/state');

test('role stripes distinguish workers from full-block leaders and coordinators', () => {
  assert.equal(palette.band.bar, '▎');
  assert.equal(palette.band.leaderBar, '█');
  assert.equal(palette.band.coordinatorBar, '█');
  assert.match(state.bandValue(0, '', { leader: true }), /^█/);
  assert.match(state.bandValue(0, '', { coordinator: true }), /^█/);
});
