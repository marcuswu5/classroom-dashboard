'use strict';

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const sessionFileStore = require('session-file-store');
const pgSession = require('connect-pg-simple')(session);
const { google } = require('googleapis');
const { summarizeFormResponses } = require('./formsSummary');

const PORT = Number(process.env.PORT || 3847);
const isProd = process.env.NODE_ENV === 'production';
const SCOPES = [
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function publicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) {
    return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return String(process.env.RENDER_EXTERNAL_URL).replace(/\/$/, '');
  }
  if (process.env.FLY_APP_NAME) {
    return `https://${process.env.FLY_APP_NAME}.fly.dev`;
  }
  return '';
}

function defaultRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const base = publicBaseUrl();
  if (base) return `${base}/auth/google/callback`;
  return `http://localhost:${PORT}/auth/google/callback`;
}

function effectiveRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri();
}

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = effectiveRedirectUri();
  if (!clientId || !clientSecret) {
    const err = new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    err.code = 'CONFIG';
    throw err;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthorizedClient(req) {
  const tokens = req.session && req.session.googleTokens;
  if (!tokens || !tokens.refresh_token) return null;
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

async function fetchAllResponses(auth, formId) {
  const formsApi = google.forms({ version: 'v1', auth });
  const out = [];
  let pageToken;
  do {
    const resp = await formsApi.forms.responses.list({
      formId,
      pageToken,
      pageSize: 500,
    });
    const list = resp.data.responses || [];
    out.push(...list);
    pageToken = resp.data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

async function fetchForm(auth, formId) {
  const formsApi = google.forms({ version: 'v1', auth });
  const resp = await formsApi.forms.get({ formId });
  return resp.data;
}

function createSessionStore() {
  if (process.env.DATABASE_URL) {
    return new pgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    });
  }
  const FileStore = sessionFileStore(session);
  const dir = path.join(__dirname, 'data', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return new FileStore({
    path: dir,
    logFn: () => {},
  });
}

const sessionSecret = process.env.SESSION_SECRET;
if (isProd && (!sessionSecret || sessionSecret.length < 32)) {
  // eslint-disable-next-line no-console
  console.warn(
    'WARNING: Set SESSION_SECRET to a long random string (32+ chars) in production.'
  );
}

const app = express();
if (isProd || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(
  session({
    store: createSessionStore(),
    name: 'cd_sid',
    secret: sessionSecret || 'dev-only-change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
    },
  })
);

app.use(express.json({ limit: '64kb' }));

app.get('/', (_req, res) => {
  res.redirect(302, '/classroom-viewer.html');
});

const dashboardDir = path.join(__dirname, '..', 'dashboard');
app.use(express.static(dashboardDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/config', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  res.json({
    clientId,
    scopes: SCOPES,
    redirectUri: effectiveRedirectUri(),
  });
});

app.get('/api/auth/status', async (req, res) => {
  const auth = getAuthorizedClient(req);
  if (!auth) {
    return res.json({ connected: false });
  }
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const { data } = await oauth2.userinfo.get();
    res.json({ connected: true, email: data.email || null });
  } catch {
    res.json({ connected: true, email: null });
  }
});

app.get('/auth/google', (req, res) => {
  try {
    const oauth2Client = createOAuth2Client();
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    req.session.save((err) => {
      if (err) {
        return res.status(500).send('Could not start sign-in. Try again.');
      }
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state,
        include_granted_scopes: true,
      });
      res.redirect(url);
    });
  } catch (e) {
    if (e.code === 'CONFIG') {
      return res
        .status(500)
        .send(
          'Server missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Set environment variables on your host.'
        );
    }
    res.status(500).send(e.message || 'OAuth error');
  }
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`/?forms_error=${encodeURIComponent(String(error))}`);
  }
  if (!code || typeof code !== 'string') {
    return res.redirect('/?forms_error=missing_code');
  }
  if (!state || state !== req.session.oauthState) {
    return res.redirect('/?forms_error=invalid_state');
  }
  delete req.session.oauthState;
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    req.session.googleTokens = tokens;
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.redirect('/?forms_connected=1');
  } catch (e) {
    return res.redirect(
      `/?forms_error=${encodeURIComponent(e.message || 'token_exchange')}`
    );
  }
});

app.post('/api/auth/disconnect', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'sign_out_failed' });
    }
    res.clearCookie('cd_sid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
    });
    res.json({ ok: true });
  });
});

app.post('/api/auth/google/code', async (req, res) => {
  const code = req.body && req.body.code;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'missing_code' });
  }
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: 'postmessage',
    });
    req.session.googleTokens = tokens;
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return res.json({ ok: true, email: data.email || null });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'exchange_failed' });
  }
});

app.get('/api/forms/:formId/summary', async (req, res) => {
  const auth = getAuthorizedClient(req);
  if (!auth) {
    return res.status(401).json({ error: 'not_connected' });
  }
  const formId = req.params.formId;
  if (!formId || formId.length > 200) {
    return res.status(400).json({ error: 'bad_form_id' });
  }
  try {
    const form = await fetchForm(auth, formId);
    const responses = await fetchAllResponses(auth, formId);
    const summary = summarizeFormResponses(form, responses);
    res.json(summary);
  } catch (e) {
    const status = e.code === 404 ? 404 : 502;
    res.status(status).json({
      error: 'forms_api_failed',
      message: e.message || String(e),
    });
  }
});

const host = '0.0.0.0';
app.listen(PORT, host, () => {
  const base = publicBaseUrl() || `http://localhost:${PORT}`;
  // eslint-disable-next-line no-console
  console.log(`Classroom dashboard listening on port ${PORT} (open ${base}/ )`);
});
