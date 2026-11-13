'use strict';

/**
 * scripts/lib/rules-template.js - Render the two agent rule files
 *
 * templates/qa-framework.rules.md     -> .claude/rules/qa-framework.md
 * templates/qa-framework.instructions.md
 *                                     -> .github/instructions/qa-framework.instructions.md
 *
 * init and upgrade both render them here, with two placeholders:
 *
 *   {{VERSION}}        the version of the package that writes the file.
 *   {{DEFECT_PREFIX}}  the project's defect ID prefix WITH its trailing hyphen, used in
 *                      rule 8 as `DEF-{{DEFECT_PREFIX}}NNN` and `REC-{{DEFECT_PREFIX}}NNN`.
 *                      Derived from conventions.defectIdPattern (see
 *                      defectPrefixFromPattern): "ABC-" for DEF-ABC-{NUM}, "" for DEF-{NUM}.
 *                      When the pattern is missing or cannot be parsed it renders the
 *                      generic "{PREFIX}-" the template carried before this placeholder.
 *
 * ownership.normalizeFor() puts both back before hashing, so a rendered file is still
 * recognised as a version the framework shipped. The prefix can only be put back when
 * the caller passes the project's renderContext(): without it, a prefix other than the
 * generic one is treated as content (a hand edit is never mistaken for a rendering).
 */

const VERSION_PLACEHOLDER = '{{VERSION}}';
const DEFECT_PREFIX_PLACEHOLDER = '{{DEFECT_PREFIX}}';
const GENERIC_DEFECT_PREFIX = '{PREFIX}-';

// The trailing number of a defect ID pattern: {NUM}, {NUMBER}, {NNN}, {{NNN}}, NNN, ###, 001.
const NUMBER_TOKEN = /^(?:\{(?:NUM|NUMBER|N+)\}|\{\{(?:NUM|NUMBER|N+)\}\}|N{2,}|#{2,}|\d{2,})$/;
// One prefix segment: a literal code (ABC, AB1) or a single-brace placeholder ({MODULE}).
const PREFIX_SEGMENT = /^(?:[A-Za-z0-9_]+|\{[A-Za-z_][A-Za-z0-9_]*\})$/;

/**
 * The defect prefix that conventions.defectIdPattern describes, without hyphens around it:
 *   DEF-ABC-{NUM} -> "ABC"     DEF-XXX-NNN -> "XXX"     DEF-{MODULE}-{NNN} -> "{MODULE}"
 *   DEF-{NUM}     -> ""        DEF-AB-{MODULE}-{NUM} -> "AB-{MODULE}"
 * The pattern must start with "DEF-" (rule 8 pairs it with REC-), end with a number token
 * and use only '-'-separated segments of letters, digits and '_', or {PLACEHOLDER}s.
 * Returns null for anything else, including a missing pattern.
 */
function defectPrefixFromPattern(pattern) {
  if (typeof pattern !== 'string') return null;
  const segments = pattern.trim().split('-');
  if (segments.length < 2 || segments[0] !== 'DEF') return null;
  if (!NUMBER_TOKEN.test(segments[segments.length - 1])) return null;
  const prefix = segments.slice(1, -1);
  if (!prefix.every((s) => PREFIX_SEGMENT.test(s))) return null;
  return prefix.join('-');
}

/** What {{DEFECT_PREFIX}} renders to for `config`: { defectPrefix: "ABC-" | "" | "{PREFIX}-" }. */
function renderContext(config) {
  const prefix = defectPrefixFromPattern(config && config.conventions && config.conventions.defectIdPattern);
  return { defectPrefix: prefix === null ? GENERIC_DEFECT_PREFIX : (prefix ? `${prefix}-` : '') };
}

/** The rules or instructions template rendered for a project. */
function renderRulesTemplate(template, version, config) {
  const { defectPrefix } = renderContext(config);
  return template
    .replace(VERSION_PLACEHOLDER, version)
    .split(DEFECT_PREFIX_PLACEHOLDER).join(defectPrefix);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Puts a rendered defect prefix back to {{DEFECT_PREFIX}} in the rule 8 IDs
 * (DEF-<prefix>NNN and REC-<prefix>NNN). The generic "{PREFIX}-" is always put back;
 * `defectPrefix` (from renderContext) is the project's own rendering, when known.
 */
function normalizeDefectPrefix(text, defectPrefix) {
  const rendered = [GENERIC_DEFECT_PREFIX];
  if (typeof defectPrefix === 'string' && defectPrefix !== GENERIC_DEFECT_PREFIX) rendered.push(defectPrefix);
  let out = text;
  for (const value of rendered) {
    // Not \b: the defect file name continues with '_' (DEF-ABC-NNN_*.md), a word character.
    const re = new RegExp(`(?<![A-Za-z0-9])(DEF|REC)-${escapeRegExp(value)}NNN(?![A-Za-z0-9])`, 'g');
    out = out.replace(re, `$1-${DEFECT_PREFIX_PLACEHOLDER}NNN`);
  }
  return out;
}

module.exports = {
  VERSION_PLACEHOLDER,
  DEFECT_PREFIX_PLACEHOLDER,
  GENERIC_DEFECT_PREFIX,
  defectPrefixFromPattern,
  renderContext,
  renderRulesTemplate,
  normalizeDefectPrefix,
};
