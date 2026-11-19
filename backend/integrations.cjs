const { token, digest } = require('./database.cjs');

async function sendReset(database, admin, config) {
  if (!config.resendKey || !config.emailFrom) throw Object.assign(new Error('ارسال ایمیل هنوز پیکربندی نشده است؛ با مدیر سایت تماس بگیرید.'), { status: 503 });
  const secret = token();
  const link = `${config.origin}/admin/reset-password?token=${secret}`;
  database.prepare('DELETE FROM resets WHERE admin_id=? OR expires<?').run(admin.id, Date.now());
  database.prepare('INSERT INTO resets VALUES (?,?,?)').run(digest(secret), admin.id, Date.now() + 3600000);
  try {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.emailFrom, to: [admin.email], subject: 'BaadeHasht — reset your password', text: `Set your BaadeHasht admin password:\n${link}\n\nThis single-use link expires in 60 minutes. If you did not request this, ignore this email.` }),
    });
    if (!result.ok) throw new Error(`Email provider returned ${result.status}`);
  } catch (error) {
    database.prepare('DELETE FROM resets WHERE token=?').run(digest(secret));
    console.error('Password reset email failed:', error.message);
    throw Object.assign(new Error('ارسال ایمیل انجام نشد. دوباره تلاش کنید.'), { status: 503 });
  }
}

module.exports = { sendReset };
