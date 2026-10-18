'use strict';

const FORWARD_SECTION_KEYS = new Set(['\t', '\x1b[C', 'l']);
const BACKWARD_SECTION_KEYS = new Set(['\x1b[Z', '\x1b[D', 'h']);

// The popup tabs follow the field order. Each tab owns a selectable list, so
// labels never take cursor positions or consume vertical list room.
function settingsSections(fields) {
  const sections = [];
  let current;
  for (const field of fields) {
    if (!current || current.name !== field.section) {
      current = { name: field.section, fields: [] };
      sections.push(current);
    }
    current.fields.push(field);
  }
  return sections;
}

function largestSectionSize(sections) {
  return Math.max(...sections.map((section) => section.fields.length));
}

function nextSection(index, direction, count) {
  return (index + direction + count) % count;
}

function sectionDirection(key) {
  if (FORWARD_SECTION_KEYS.has(key)) return 1;
  if (BACKWARD_SECTION_KEYS.has(key)) return -1;
  return 0;
}

function sectionWindow(fields, cursor, room, top, scrollTop) {
  const nextTop = scrollTop(fields.length, cursor, room, top);
  return {
    top: nextTop,
    fields: fields.slice(nextTop, nextTop + room),
    hiddenAbove: nextTop,
    hiddenBelow: Math.max(0, fields.length - nextTop - room),
  };
}

module.exports = { settingsSections, largestSectionSize, nextSection, sectionDirection, sectionWindow };
