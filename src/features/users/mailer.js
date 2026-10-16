/**
 * mailer.js
 * Generic email sender, available for future use (e.g. a password-reset
 * flow) — not currently called anywhere, since account creation is
 * self-signup now (no invite email). Two modes, switched purely by env vars:
 *
 *   - 'dev' (default): no real email server needed. Writes each message to
 *     data/outbox/*.txt and logs it to the console instead of sending it.
 *   - 'smtp': set SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
 *     SMTP_SECURE) to send through a real mail server — your own relay,
 *     Exchange Online, or any provider's SMTP endpoint.
 */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../../config');

const OUTBOX_DIR = path.join(config.dataDir, 'outbox');
const MODE = config.mail.host ? 'smtp' : 'dev';
const FROM = config.mail.from;

let transporter = null;
if (MODE === 'smtp') {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
}

async function send({ to, subject, text, html }) {
  if (MODE === 'smtp') {
    await transporter.sendMail({ from: FROM, to, subject, text, html });
    return { mode: 'smtp' };
  }

  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(OUTBOX_DIR, `${stamp}-${to.replace(/[^a-z0-9@.]/gi, '_')}.txt`);
  fs.writeFileSync(file, `To: ${to}\nFrom: ${FROM}\nSubject: ${subject}\n\n${text}\n`, 'utf8');
  console.log(`[mailer:dev] No SMTP_HOST configured — wrote email instead of sending it.`);
  console.log(`[mailer:dev] To: ${to} | Subject: ${subject}`);
  console.log(`[mailer:dev] Saved to: ${file}`);
  return { mode: 'dev', file };
}

module.exports = { send, MODE };
