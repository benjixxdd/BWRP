import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;
// Wichtig bei Render, Railway, VPS-Reverse-Proxies und HTTPS-Termination.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const REDIRECT_URI = `${PUBLIC_URL}/auth/discord/callback`;
const IS_HTTPS = PUBLIC_URL.startsWith('https://');
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1571596496460054661';
const required = ['DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_BOT_TOKEN','DISCORD_WEBHOOK_URL','SESSION_SECRET'];
const missing = required.filter(k => !process.env[k]);

app.use(express.json({ limit: '30kb' }));
app.use(session({
  name: 'bwrp.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave: false,
  saveUninitialized: false,
  proxy: process.env.NODE_ENV === 'production',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_HTTPS,
    maxAge: 1000 * 60 * 60 * 4
  }
}));
app.use(express.static('public'));

const discordApi = 'https://discord.com/api/v10';
const isConfigured = () => missing.length === 0;

app.get('/api/config', (_req, res) => res.json({ discordConfigured: isConfigured() }));
app.get('/auth/discord', (req, res) => {
  if (!isConfigured()) return res.status(503).send('Discord OAuth ist noch nicht konfiguriert. Bitte .env einrichten.');
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'identify', state });
  // State vor dem Verlassen der Website sicher in der Session speichern.
  req.session.save(err => {
    if (err) return res.status(500).send('Anmeldesitzung konnte nicht gespeichert werden. Bitte Server-Logs prüfen.');
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) return res.status(400).send('Discord-Anmeldung fehlgeschlagen (ungültiger Status).');
    delete req.session.oauthState;
    const tokenResponse = await fetch(`${discordApi}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: req.query.code, redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokenData.error_description || 'Token-Austausch fehlgeschlagen');
    const userResponse = await fetch(`${discordApi}/users/@me`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const user = await userResponse.json();
    if (!userResponse.ok) throw new Error('Discord-Profil konnte nicht geladen werden.');
    req.session.discordUser = { id: user.id, username: user.global_name || user.username, avatar: user.avatar };
    req.session.save(err => {
      if (err) return res.status(500).send('Discord war erfolgreich, aber die Sitzung konnte nicht gespeichert werden. Bitte Server-Logs prüfen.');
      res.redirect('/#entbannung');
    });
  } catch (error) { res.status(400).send(`Discord-Anmeldung fehlgeschlagen: ${error.message}`); }
});

app.get('/api/session', (req, res) => res.json({ user: req.session.discordUser || null }));

async function checkDiscordBan(userId) {
  // Discord GET Guild Ban benötigt für den Bot die Berechtigung „Mitglieder bannen“.
  const response = await fetch(`${discordApi}/guilds/${GUILD_ID}/bans/${userId}`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
  if (response.status === 404) return { banned: false };
  if (response.status === 200) return { banned: true };
  const body = await response.text();
  throw new Error(`Discord-Bannstatus konnte nicht geprüft werden (HTTP ${response.status}). ${body.slice(0, 180)}`);
}

app.get('/api/ban-status', async (req, res) => {
  if (!req.session.discordUser) return res.status(401).json({ error: 'Bitte zuerst mit Discord anmelden.' });
  if (!isConfigured()) return res.status(503).json({ error: 'Der Discord-Dienst ist noch nicht eingerichtet.' });
  try {
    const result = await checkDiscordBan(req.session.discordUser.id);
    res.json({ ...result, username: req.session.discordUser.username });
  } catch (error) { res.status(503).json({ error: error.message }); }
});

app.post('/api/appeal', async (req, res) => {
  if (!req.session.discordUser) return res.status(401).json({ error: 'Bitte zuerst mit Discord anmelden.' });
  if (!isConfigured()) return res.status(503).json({ error: 'Der Discord-Dienst ist noch nicht eingerichtet.' });
  const { type, answers } = req.body || {};
  if (!['Discord Entbannung', 'Ingame Entbannung'].includes(type)) return res.status(400).json({ error: 'Ungültige Antragsart.' });
  const questions = type === 'Discord Entbannung'
    ? ['Warum wurdest du deiner Meinung nach gebannt?', 'Warum möchtest du entbannt werden?', 'Was würdest du künftig anders machen?']
    : ['Wie lautet dein Roblox-Benutzername?', 'Warum wurdest du ingame gebannt?', 'Warum sollte dein Bann aufgehoben werden?', 'Möchtest du noch etwas ergänzen?'];
  if (!answers || questions.some((q, i) => typeof answers[i] !== 'string' || answers[i].trim().length < 3 || answers[i].length > 1500)) return res.status(400).json({ error: 'Bitte beantworte alle Fragen vollständig (max. 1.500 Zeichen je Antwort).' });
  try {
    const ban = await checkDiscordBan(req.session.discordUser.id);
    if (ban.banned) return res.status(403).json({ error: 'Du bist noch auf unserem Discord gebannt. Eine Antragstellung ist erst nach deiner Discord-Entbannung möglich.' });
    const embed = {
      title: type, color: 0xE2B007,
      description: `**Antragsteller:** ${req.session.discordUser.username}\n**Discord-ID:** ${req.session.discordUser.id}`,
      fields: questions.map((question, i) => ({ name: question, value: String(answers[i]).trim().slice(0, 1500) })),
      footer: { text: 'Bundeswehr Roleplay • Entbannungssystem' }, timestamp: new Date().toISOString()
    };
    const hook = await fetch(process.env.DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) });
    if (!hook.ok) throw new Error(`Webhook-Fehler (HTTP ${hook.status}).`);
    res.json({ success: true, message: 'Dein Antrag wurde erfolgreich übermittelt.' });
  } catch (error) { res.status(503).json({ error: error.message }); }
});

app.listen(PORT, () => {
  console.log(`Bundeswehr Roleplay läuft auf ${PUBLIC_URL}`);
  console.log(`Discord OAuth Redirect URI: ${REDIRECT_URI}`);
  if (missing.length) console.warn(`Noch nicht eingerichtet: ${missing.join(', ')}`);
});
