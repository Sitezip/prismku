// One plain notice when a feedback ticket is marked fixed. Player text never
// enters headers: the subject, From, and recipient are fixed or taken only
// from the address stored on the ticket.

export const EMAIL_RE = /^[^\s@<>()"',;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;
export const FIX_FROM = { email: 'noreply@prismku.com', name: 'Prismku' };
export const FIX_SUBJECT = 'Your Prismku bug report was fixed';
export const FIX_EMAIL_CAP_PER_HOUR = 20;
export const CLAIM_STALE_MS = 10 * 60 * 1000;
export const QUOTE_MAX = 180;
const STATUSES = ['new', 'triaged', 'done', 'wontfix', 'spam'];

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// One line, no controls, truncated. Safe to place in a body, never in a header.
export function quoteReport(message, max = QUOTE_MAX) {
  const clean = String(message ?? '')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '(no message)';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function renderFixEmail(message) {
  const quote = quoteReport(message);
  const text = [
    'Your Prismku bug report was fixed.',
    '',
    'You wrote:',
    `"${quote}"`,
    '',
    'Play the latest puzzle: https://prismku.com',
    'Version history: https://prismku.com/versions/',
    '',
    "This is the only email you'll get about this report.",
  ].join('\n');
  const html = [
    '<p>Your Prismku bug report was fixed.</p>',
    '<p>You wrote:</p>',
    `<blockquote>${escapeHtml(quote)}</blockquote>`,
    '<p><a href="https://prismku.com">Play Prismku</a> · <a href="https://prismku.com/versions/">Version history</a></p>',
    "<p>This is the only email you'll get about this report.</p>",
  ].join('\n');
  return { subject: FIX_SUBJECT, text, html };
}

// The only address we will ever send to. Request bodies are not consulted.
export function recipientFor(row) {
  const contact = typeof row?.contact === 'string' ? row.contact.trim() : '';
  return isValidEmail(contact) ? contact : null;
}

// null = never recorded; 0 = already done before this feature (do not mail);
// > 0 = sent; < 0 = claim in progress (−ms).
export function canClaim(sentAt, now, staleMs = CLAIM_STALE_MS) {
  if (sentAt == null) return true;
  if (typeof sentAt === 'number' && sentAt < 0 && -sentAt <= now - staleMs) return true;
  return false;
}

export function planFixUpdate(row, requestedStatus, { recentSends = 0, now = Date.now(), cap = FIX_EMAIL_CAP_PER_HOUR } = {}) {
  const status = requestedStatus === 'fixed' ? 'done' : requestedStatus;
  if (!STATUSES.includes(status)) {
    return { ok: false, http: 400, error: 'status must be new, triaged, done, fixed, wontfix, or spam', send: false };
  }
  if (status !== 'done') return { ok: true, status, email: 'not-requested', send: false };
  const sentAt = row?.fix_email_sent_at ?? null;
  if (!canClaim(sentAt, now)) {
    const email = sentAt === 0 ? 'skipped-already-done' : sentAt > 0 ? 'already-sent' : 'in-progress';
    return { ok: true, status: 'done', email, send: false };
  }
  const to = recipientFor(row);
  if (!to) return { ok: true, status: 'done', email: 'no-address', send: false };
  if (recentSends >= cap) {
    return { ok: false, http: 429, error: 'email send cap reached for this hour — ticket left unchanged', send: false };
  }
  return { ok: true, status: 'done', email: 'send', send: true, to };
}
