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

async function videos(database, settings, config, manual, force = false) {
  if (settings.videoMode !== 'automatic' || !settings.channel || !config.youtubeKey) return { episodes: manual, source: 'manual' };
  const cacheKey = `youtube:${settings.channel}:${settings.videoCount}`;
  const cached = database.prepare('SELECT * FROM cache WHERE id=?').get(cacheKey);
  if (!force && cached && Date.now() - cached.updated < 25 * 60000) return { episodes: JSON.parse(cached.data), source: 'youtube' };
  async function request(resource, params) {
    const query = new URLSearchParams({ ...params, key: config.youtubeKey });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${query}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
    return response.json();
  }
  try {
    const channel = await request('channels', { part: 'contentDetails', ...(settings.channel.startsWith('@') ? { forHandle: settings.channel } : { id: settings.channel }) });
    const playlistId = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) throw new Error('YouTube channel not found');
    const feed = await request('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: String(settings.videoCount) });
    const episodes = (feed.items || []).filter(item => /^[\w-]{11}$/.test(item.contentDetails?.videoId || '')).map(item => ({
      id: item.contentDetails.videoId, youtubeId: item.contentDetails.videoId,
      title: String(item.snippet.title), description: String(item.snippet.description || ''),
      thumbnail: `https://i.ytimg.com/vi/${item.contentDetails.videoId}/hqdefault.jpg`,
      publishAt: item.contentDetails.videoPublishedAt || item.snippet.publishedAt, status: 'published',
    }));
    if (!episodes.length) throw new Error('YouTube returned no public videos');
    database.prepare('INSERT INTO cache VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated').run(cacheKey, JSON.stringify(episodes), Date.now());
    return { episodes, source: 'youtube' };
  } catch (error) {
    console.warn('YouTube fallback:', error.message);
    return { episodes: cached ? JSON.parse(cached.data) : manual, source: cached ? 'cached' : 'manual' };
  }
}

module.exports = { sendReset, videos };
