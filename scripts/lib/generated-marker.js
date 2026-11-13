'use strict';

/**
 * scripts/lib/generated-marker.js - Ownership marker for generated files
 *
 * A file the framework renders (agents from the config, command wrappers from code)
 * carries the hash of its own body in a trailing HTML comment:
 *
 *   <!-- qa-framework:generated sha256=<hex> -->
 *
 * It sits after the body, separated by a blank line, so YAML frontmatter stays at the
 * top of the file and the comment renders as nothing. The hash covers everything
 * before that blank line after the normalization upgrade uses everywhere (UTF-8 BOM
 * dropped, CRLF as LF), so line-ending churn is not mistaken for an edit.
 */

const crypto = require('crypto');

const BOM = String.fromCharCode(0xfeff);
const GENERATED_MARKER_RE = /\r?\n<!-- qa-framework:generated sha256=([0-9a-f]{64}) -->\r?\n?$/;

function normalizeNewlines(text) {
  return (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r\n/g, '\n');
}

function normalizedHash(text) {
  return crypto.createHash('sha256').update(normalizeNewlines(text), 'utf8').digest('hex');
}

function withFinalNewline(text) {
  if (text.endsWith('\n')) return text;
  return text + (text.includes('\r\n') ? '\r\n' : '\n');
}

/** Content plus the trailing ownership marker. */
function stampGenerated(content) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const body = withFinalNewline(content);
  return `${body}${eol}<!-- qa-framework:generated sha256=${normalizedHash(body)} -->${eol}`;
}

/**
 * Splits a file into its body and marker.
 *   { body, marker: '<hex>' | null, intact: boolean }
 * `intact` is true only when a marker is present and matches the body.
 */
function splitGenerated(text) {
  const match = text.match(GENERATED_MARKER_RE);
  if (!match) return { body: text, marker: null, intact: false };
  const body = text.slice(0, match.index);
  return { body, marker: match[1], intact: normalizedHash(body) === match[1] };
}

module.exports = {
  GENERATED_MARKER_RE,
  normalizeNewlines,
  normalizedHash,
  withFinalNewline,
  stampGenerated,
  splitGenerated,
};
