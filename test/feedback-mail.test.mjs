// Validation, escaping, and one-email idempotency. No network and no real mail.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  FIX_EMAIL_CAP_PER_HOUR, FIX_FROM, FIX_SUBJECT, canClaim, escapeHtml, isValidEmail,
  planFixUpdate, quoteReport, renderFixEmail, recipientFor,
} from '../src/feedback-mail.js';
import { adminFeedback } from '../src/worker.js';

const SECRET = 'test-admin-secret-value';

assert.equal(isValidEmail('you@example.com'), true);
assert.equal(isValidEmail('jake.graff+prism@gmail.com'), true);
for (const bad of ['', 'not-an-email', 'a@b', 'a@b.c', 'a@b.com,c@d.com', 'you@example.com\n', 'you@example.com\r\nBcc: evil@x.com', 'a b@c.com', '<script>@x.com', 'x@y.com ']) {
  assert.equal(isValidEmail(bad), false, bad);
}
assert.equal(recipientFor({ contact: '  player@example.com ' }), 'player@example.com');
assert.equal(recipientFor({ contact: 'nope' }), null);
assert.equal(recipientFor({ contact: null }), null);

const nasty = 'Tiles <b>overlap</b> & "flash"\r\nBcc: evil@example.com\r\nSubject: pwned';
const quote = quoteReport(nasty);
assert.ok(!/[\r\n]/.test(quote), 'quote is one line');
assert.ok(quote.includes('Bcc: evil@example.com'));
assert.equal(escapeHtml(quote).includes('<b>'), false);
assert.ok(escapeHtml(quote).includes('&lt;b&gt;'));
assert.ok(escapeHtml(`a&b<>"'`).includes('&amp;') && escapeHtml(`a&b<>"'`).includes('&#39;'));

const long = 'word '.repeat(80);
const truncated = quoteReport(long);
assert.ok(truncated.length <= 180, truncated.length);
assert.ok(truncated.endsWith('…'));

const mail = renderFixEmail(nasty);
assert.equal(mail.subject, FIX_SUBJECT);
assert.equal(mail.subject, 'Your Prismku bug report was fixed');
assert.ok(!mail.subject.includes('Bcc') && !mail.subject.includes('overlap'));
assert.equal(JSON.stringify(FIX_FROM), JSON.stringify({ email: 'noreply@prismku.com', name: 'Prismku' }));
assert.ok(mail.text.includes('https://prismku.com'));
assert.ok(mail.text.includes('https://prismku.com/versions/'));
assert.ok(mail.text.includes("This is the only email you'll get about this report."));
assert.ok(mail.html.includes('https://prismku.com/versions/'));
assert.ok(mail.html.includes('&lt;b&gt;'));
assert.ok(!mail.html.includes('<b>overlap</b>'));
assert.ok(!mail.text.includes('\r\nBcc'));
assert.equal(renderFixEmail('').text.includes('(no message)'), true);

const now = Date.now();
const row = { status: 'new', contact: 'player@example.com', message: 'the board stuck', fix_email_sent_at: null };
const first = planFixUpdate(row, 'fixed', { recentSends: 0, now });
assert.equal(first.send, true);
assert.equal(first.to, 'player@example.com');
assert.equal(first.status, 'done');
assert.equal(planFixUpdate({ ...row, fix_email_sent_at: now }, 'done', { now }).email, 'already-sent');
assert.equal(planFixUpdate({ ...row, fix_email_sent_at: 0 }, 'done', { now }).send, false);
assert.equal(planFixUpdate({ ...row, fix_email_sent_at: 0 }, 'done', { now }).email, 'skipped-already-done');
assert.equal(planFixUpdate({ ...row, contact: '' }, 'done', { now }).email, 'no-address');
assert.equal(planFixUpdate({ ...row, contact: 'bad' }, 'done', { now }).email, 'no-address');
assert.equal(planFixUpdate(row, 'triaged', { now }).email, 'not-requested');
assert.equal(planFixUpdate(row, 'nope', { now }).http, 400);
const capped = planFixUpdate(row, 'done', { recentSends: FIX_EMAIL_CAP_PER_HOUR, now });
assert.equal(capped.http, 429);
assert.equal(capped.send, false);
assert.equal(planFixUpdate(row, 'done', { recentSends: FIX_EMAIL_CAP_PER_HOUR - 1, now }).send, true);
// A different address on the request is not a field this function reads.
assert.equal(planFixUpdate(row, 'done', { now }).to, recipientFor(row));
assert.equal(canClaim(null, now), true);
assert.equal(canClaim(0, now), false);
assert.equal(canClaim(now, now), false);
assert.equal(canClaim(-(now - 1000), now), false);
assert.equal(canClaim(-(now - 11 * 60 * 1000), now), true);

function wrap(db) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              return db.prepare(sql).get(...params) ?? null;
            },
            async run() {
              const info = db.prepare(sql).run(...params);
              return { meta: { changes: Number(info.changes) } };
            },
          };
        },
      };
    },
  };
}

function seed() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      contact TEXT,
      context TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new',
      ip_hash TEXT
    );
  `);
  db.prepare('INSERT INTO feedback (created_at, type, message, contact, status) VALUES (?,?,?,?,?)')
    .run(1, 'bug', 'already fixed before mail', 'old@example.com', 'done');
  db.prepare('INSERT INTO feedback (created_at, type, message, contact, status) VALUES (?,?,?,?,?)')
    .run(2, 'bug', nasty, 'player@example.com', 'new');
  db.prepare('INSERT INTO feedback (created_at, type, message, contact, status) VALUES (?,?,?,?,?)')
    .run(3, 'idea', 'no address on this one', null, 'new');
  db.prepare('INSERT INTO feedback (created_at, type, message, contact, status) VALUES (?,?,?,?,?)')
    .run(4, 'bug', 'bad contact stored', 'not-an-email', 'triaged');
  const sql = readFileSync(new URL('../migrations/0004_feedback_fix_email.sql', import.meta.url), 'utf8');
  db.exec(sql);
  db.exec(sql);
  const suppressed = db.prepare('SELECT sent_at FROM feedback_fix_email WHERE feedback_id = 1').get();
  assert.equal(suppressed.sent_at, 0);
  db.prepare('UPDATE feedback_fix_email SET sent_at = ? WHERE feedback_id = 1').run(111);
  db.exec(sql);
  assert.equal(db.prepare('SELECT sent_at FROM feedback_fix_email WHERE feedback_id = 1').get().sent_at, 111);
  db.prepare('UPDATE feedback_fix_email SET sent_at = 0 WHERE feedback_id = 1').run();
  return db;
}

function call(env, id, status, extra = {}) {
  return adminFeedback(env, new Request('https://prismku.com/api/admin/feedback/' + id, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ status, contact: 'evil@example.com', to: 'evil@example.com', ...extra }),
  }), id);
}

const db = seed();
const sent = [];
const env = {
  DB: wrap(db),
  FEEDBACK_ADMIN_SECRET: SECRET,
  EMAIL: {
    async send(msg) { sent.push(msg); return { messageId: 'local-test' }; },
  },
};

const denied = await adminFeedback(env, new Request('https://prismku.com/api/admin/feedback/2', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-secret-value' },
  body: JSON.stringify({ status: 'done' }),
}), 2);
assert.equal(denied.status, 401);
assert.equal(db.prepare("SELECT status FROM feedback WHERE id = 2").get().status, 'new');

const old = await call(env, 1, 'done');
assert.equal(old.status, 200);
assert.equal((await old.json()).email, 'skipped-already-done');
assert.equal(sent.length, 0);

const ok = await call(env, 2, 'fixed');
assert.equal(ok.status, 200, await ok.clone().text());
assert.equal((await ok.json()).email, 'sent');
assert.equal(sent.length, 1);
assert.equal(sent[0].to, 'player@example.com');
assert.equal(sent[0].subject, FIX_SUBJECT);
assert.equal(sent[0].from.email, 'noreply@prismku.com');
assert.deepEqual(Object.keys(sent[0]).sort(), ['from', 'html', 'subject', 'text', 'to']);
assert.ok(sent[0].html.includes('&lt;b&gt;'));
assert.ok(!sent[0].subject.includes('evil'));
assert.ok(!JSON.stringify(sent[0].from).includes('evil'));
assert.equal(db.prepare('SELECT status FROM feedback WHERE id = 2').get().status, 'done');
const stamped = db.prepare('SELECT sent_at FROM feedback_fix_email WHERE feedback_id = 2').get().sent_at;
assert.ok(stamped > 0);

const again = await call(env, 2, 'done');
assert.equal((await again.json()).email, 'already-sent');
assert.equal(sent.length, 1);

const none = await call(env, 3, 'done');
assert.equal((await none.json()).email, 'no-address');
assert.equal(sent.length, 1);
assert.equal(db.prepare('SELECT status FROM feedback WHERE id = 3').get().status, 'done');

const bad = await call(env, 4, 'done');
assert.equal((await bad.json()).email, 'no-address');
assert.equal(sent.length, 1);

const triaged = await call(env, 2, 'triaged');
assert.equal((await triaged.json()).email, 'not-requested');
assert.equal(sent.length, 1);
const back = await call(env, 2, 'done');
assert.equal((await back.json()).email, 'already-sent');
assert.equal(sent.length, 1);

// Failed send clears the claim so one retry can deliver, and does not double-send after success.
db.prepare('INSERT INTO feedback (created_at, type, message, contact, status) VALUES (?,?,?,?,?)')
  .run(5, 'bug', 'retry me', 'retry@example.com', 'new');
let fail = true;
env.EMAIL = {
  async send(msg) {
    if (fail) { fail = false; throw new Error('upstream'); }
    sent.push(msg);
    return { messageId: 'retry' };
  },
};
const logged = console.error;
console.error = () => {};
const failed = await call(env, 5, 'done');
console.error = logged;
assert.equal(failed.status, 502);
assert.equal((await failed.json()).email, 'failed');
assert.equal(db.prepare('SELECT status FROM feedback WHERE id = 5').get().status, 'done');
assert.equal(db.prepare('SELECT sent_at FROM feedback_fix_email WHERE feedback_id = 5').get(), undefined);
const retried = await call(env, 5, 'done');
assert.equal((await retried.json()).email, 'sent');
assert.equal(sent.filter(m => m.to === 'retry@example.com').length, 1);
const third = await call(env, 5, 'done');
assert.equal((await third.json()).email, 'already-sent');
assert.equal(sent.filter(m => m.to === 'retry@example.com').length, 1);

// Hourly cap leaves the ticket unchanged.
for (let i = 0; i < FIX_EMAIL_CAP_PER_HOUR; i++) {
  db.prepare('INSERT INTO feedback_fix_email (feedback_id, sent_at) VALUES (?, ?)').run(1000 + i, Date.now());
}
db.prepare('INSERT INTO feedback (created_at, type, message, contact, status) VALUES (?,?,?,?,?)')
  .run(6, 'bug', 'over the cap', 'cap@example.com', 'new');
const cappedRes = await call(env, 6, 'done');
assert.equal(cappedRes.status, 429);
assert.equal(db.prepare('SELECT status FROM feedback WHERE id = 6').get().status, 'new');
assert.equal(sent.filter(m => m.to === 'cap@example.com').length, 0);

const missing = await call(env, 99, 'done');
assert.equal(missing.status, 404);

console.log('feedback mail tests passed');
