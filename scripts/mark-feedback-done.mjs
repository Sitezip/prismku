// Mark one feedback ticket through the admin endpoint so a fix email can go out.
// The Worker sends the mail. This script does not.
//
//   FEEDBACK_ADMIN_SECRET=... node scripts/mark-feedback-done.mjs <id> [status]
//   BASE=https://prismku.com   (default)
//   status defaults to done. "fixed" is the same as done.
//
// FEEDBACK_ADMIN_SECRET is the Worker secret of that name. Do not commit it.

const id = process.argv[2];
const status = process.argv[3] || 'done';
const secret = process.env.FEEDBACK_ADMIN_SECRET;
const base = (process.env.BASE || 'https://prismku.com').replace(/\/$/, '');

if (!/^\d+$/.test(id || '')) {
  console.error('usage: FEEDBACK_ADMIN_SECRET=... node scripts/mark-feedback-done.mjs <id> [status]');
  process.exit(2);
}
if (!secret) {
  console.error('FEEDBACK_ADMIN_SECRET is not set');
  process.exit(2);
}

const res = await fetch(`${base}/api/admin/feedback/${id}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
  body: JSON.stringify({ status }),
});
const text = await res.text();
console.log(res.status, text);
process.exit(res.ok ? 0 : 1);
