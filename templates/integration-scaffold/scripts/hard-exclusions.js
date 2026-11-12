'use strict';

/**
 * Framework hard exclusions for API writes (write-safety-policy.md, section 4).
 *
 * A write whose endpoint path matches any of these patterns is rejected by gate 3,
 * whatever the write catalog says. The catalog says what is allowed; this list says
 * what no catalog can allow.
 *
 * ADD-ONLY. A project adds its own patterns in fixtures/project-exclusions.ts; it
 * cannot remove or narrow these. api-guard.js always evaluates this list first and
 * only appends the project's entries to it: there is no option, parameter or
 * setting that replaces it. Removing an entry here is a code change to a
 * framework-owned file, visible in review and reported by `qa-framework upgrade`.
 *
 * How a pattern is matched (see api-guard.js, matchExclusion):
 *   - always case-insensitively;
 *   - against the raw path AND against a "words" form of it, where camelCase,
 *     `_`, `-` and `.` boundaries become `/` (`api/UploadFile/Register` ->
 *     `api/upload/file/register`);
 *   - so `\bfile` matches `UploadFile` and `upload_file` but not `UserProfile`,
 *     while a bare substring such as `send` also catches `resendCode`.
 * Short words that occur inside common entity names are anchored with `\b`; the
 * distinctive ones are left as substrings. A doubtful match counts as a match: a
 * false positive costs one blocked test, a false negative can cost a real email or
 * a real document.
 *
 * Patterns use generic vocabulary only (English plus common Spanish route words).
 * Names of concrete internal or external systems are project data: they go in the
 * project's own file, never here.
 */

/** @typedef {{ id: string, title: string, patterns: RegExp[] }} ExclusionCategory */

/** @type {ExclusionCategory[]} */
const FRAMEWORK_EXCLUSIONS = [
  {
    id: 'notifications',
    title: 'Email and notifications',
    patterns: [
      /mail/i,          // email, mailing, sendmail, mailbox
      /\bsms/i,
      /notif/i,         // notify, notification, notificacion
      /\bpush/i,
      /newsletter/i,
      /\bmessag/i,      // message, messaging
      /whatsapp/i,
      /correo/i,
      /\bmensaj/i,
    ],
  },
  {
    id: 'dispatch-legal-documents',
    title: 'Dispatches and legal or customs documents',
    patterns: [
      /dispatch/i,
      /despach/i,
      /waybill/i,
      /\bgu[ií]a/i,   // guia, guia de despacho
      /invoice/i,
      /factur/i,
      /\btax/i,
      /tribut/i,
      /\bcustoms\b/i,
      /aduan/i,
      /\bfolio/i,
      /\bdte\b/i,
      /credit.?note/i,
      /nota.?de.?cr[eé]dito/i,
      /\bboleta/i,
      /fiscal/i,
    ],
  },
  {
    id: 'external-transmission',
    title: 'Transmission to external or production systems',
    patterns: [
      /send/i,          // send, sender, resend, sending
      /transmi/i,       // transmit, transmision
      /\bsync/i,
      /synchroni/i,
      /sincroniz/i,
      /replicat/i,
      /webhook/i,
      /\bpublish/i,
      /\benvi[oa]/i,    // enviar, envio, envia (not "environment")
      /\benvío/i,
      // "production" is deliberately absent: it is also a common entity name
      // (production orders, production lines). Production hosts are refused by the
      // environment check in api-guard.js, whatever the path.
    ],
  },
  {
    id: 'file-generation',
    title: 'File download or generation',
    patterns: [
      /download/i,
      /descarg/i,
      /\bexport/i,
      /\bexporta/i,
      /\breport/i,      // report, reporte
      /\binforme/i,
      /\bpdf/i,
      /\bexcel/i,
      /\bxlsx?\b/i,
      /\bcsv\b/i,
      /\bprint/i,
      /imprim/i,
      /\bfiles?\b/i,
      /\barchivo/i,
    ],
  },
  {
    id: 'bulk-operations',
    title: 'Bulk operations',
    patterns: [
      /\bbulk/i,
      /\bbatch/i,
      /\bmass/i,
      /masiv/i,
      /\bimport/i,      // import, importar
      /\bmany\b/i,      // updateMany, deleteMany
      /\bmultiple/i,
      /apply.?to.?all/i,
      /\b(update|delete|remove|apply|approve|close)\W?all\b/i,
    ],
  },
];

// Deep freeze: the list, each category, each pattern list and each RegExp (a frozen
// RegExp also refuses RegExp.prototype.compile, which would otherwise rewrite it in
// place). api-guard.js additionally snapshots every pattern's source at load time
// and compiles its own copies, so nothing done to these objects later reaches it.
for (const category of FRAMEWORK_EXCLUSIONS) {
  for (const pattern of category.patterns) Object.freeze(pattern);
  Object.freeze(category.patterns);
  Object.freeze(category);
}
Object.freeze(FRAMEWORK_EXCLUSIONS);

module.exports = { FRAMEWORK_EXCLUSIONS };
