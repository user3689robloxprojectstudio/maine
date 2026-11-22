const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const COUNTDOWN_SECONDS = 15;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');

for (const dir of [PUBLIC_DIR, SCRIPTS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

const activeCountdowns = new Map();
const verifiedTokens = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of activeCountdowns.entries()) {
    if (data.expiresAt < now) activeCountdowns.delete(id);
  }
  for (const [token, data] of verifiedTokens.entries()) {
    if (data.expiresAt < now) verifiedTokens.delete(token);
  }
}, 5 * 60 * 1000);

app.get('/H.jpg', (req, res) => {
  const publicLogo = path.join(PUBLIC_DIR, 'H.jpg');
  const rootLogo = path.join(ROOT_DIR, 'H.jpg');
  if (fs.existsSync(publicLogo)) return res.sendFile(publicLogo);
  if (fs.existsSync(rootLogo)) return res.sendFile(rootLogo);
  return res.status(404).end();
});

app.get('/', (req, res) => {
  const publicIndex = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  return res.status(404).type('text/plain').send('Missing public/index.html');
});

function resolveSafeFolder(rawName) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    return null;
  }
  const safeFolder = path.basename(decoded).trim();
  if (!safeFolder || safeFolder === '.' || safeFolder === '..') return null;

  const base = path.resolve(SCRIPTS_DIR);
  const full = path.resolve(base, safeFolder);
  if (!full.startsWith(base + path.sep)) return null;

  return { safeFolder, full };
}

function buildVerificationHtml(folderName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify // ${folderName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl">
    <div class="flex items-center gap-3 mb-4">
      <img src="/H.jpg" alt="HyperCheat" onerror="this.style.display='none'" class="w-8 h-8 rounded-lg object-cover" />
      <div>
        <h1 class="text-lg font-bold text-white">Verification Countdown</h1>
        <p class="text-xs text-zinc-400">Script: <span class="text-violet-400 font-mono">${folderName}</span></p>
      </div>
    </div>

    <div id="countdownBox" class="bg-zinc-950 border border-white/10 rounded-xl p-5 text-center space-y-3">
      <p class="text-xs text-zinc-400">Please wait for the countdown to finish:</p>
      <p id="countdownDisplay" class="text-4xl font-bold font-mono text-cyan-400">15s</p>
      <button id="unlockBtn" onclick="unlockScript()" disabled
        class="w-full bg-white/10 text-zinc-500 font-semibold text-xs py-2.5 rounded-xl transition cursor-not-allowed">
        Waiting for countdown...
      </button>
    </div>

    <p id="statusMsg" class="text-xs text-red-400 mt-3 hidden"></p>

    <div id="unlockedBox" class="hidden mt-5 pt-4 border-t border-white/10 space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          LOADSTRING READY
        </span>
        <button id="copyBtn" onclick="copyLoadstring()"
          class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg text-white">
          Copy Loadstring
        </button>
      </div>

      <pre id="loadstringOutput" class="p-3 rounded-xl bg-zinc-950 border border-white/10 text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap break-all"></pre>

      <button onclick="toggleRaw()"
        class="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-medium py-2 rounded-xl transition">
        Show / Hide Raw Text
      </button>

      <pre id="rawOutput" class="hidden p-3 rounded-xl bg-zinc-950 border border-white/10 text-xs font-mono text-zinc-300 overflow-x-auto max-h-52 whitespace-pre-wrap break-all"></pre>
    </div>
  </div>

  <script>
    const folder = ${JSON.stringify(folderName)};
    let sessionId = '';
    let secondsLeft = ${COUNTDOWN_SECONDS};
    let finished = false;
    let loadstringText = '';

    async function startCountdown() {
      const res = await fetch('/api/countdown/start?folder=' + encodeURIComponent(folder));
      const data = await res.json();
      sessionId = data.sessionId;
      secondsLeft = data.seconds || ${COUNTDOWN_SECONDS};
      document.getElementById('countdownDisplay').textContent = secondsLeft + 's';

      const btn = document.getElementById('unlockBtn');
      const timer = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft > 0) {
          document.getElementById('countdownDisplay').textContent = secondsLeft + 's';
        } else {
          clearInterval(timer);
          finished = true;
          document.getElementById('countdownDisplay').textContent = '0s';
          btn.disabled = false;
          btn.className = 'w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:opacity-90 text-white font-semibold text-xs py-2.5 rounded-xl transition cursor-pointer';
          btn.textContent = 'Get Loadstring';
        }
      }, 1000);
    }

    async function unlockScript() {
      if (!finished) return;
      const statusMsg = document.getElementById('statusMsg');
      statusMsg.classList.add('hidden');

      const res = await fetch('/api/countdown/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, folder })
      });

      const data = await res.json();
      if (!res.ok) {
        statusMsg.textContent = data.error || 'Countdown not finished yet.';
        statusMsg.classList.remove('hidden');
        return;
      }

      const fullRawUrl = window.location.origin + data.rawEndpoint;
      loadstringText = 'loadstring(game:HttpGet("' + fullRawUrl + '"))()';

      document.getElementById('countdownBox').classList.add('hidden');
      document.getElementById('unlockedBox').classList.remove('hidden');
      document.getElementById('loadstringOutput').textContent = loadstringText;
      document.getElementById('rawOutput').textContent = data.rawText;
    }

    function copyLoadstring() {
      if (!loadstringText) return;
      navigator.clipboard.writeText(loadstringText);
      document.getElementById('copyBtn').textContent = 'Copied!';
    }

    function toggleRaw() {
      document.getElementById('rawOutput').classList.toggle('hidden');
    }

    startCountdown();
  </script>
</body>
</html>`;
}

function ensureVerificationHtml(folderName, folderPath) {
  const verificationFile = path.join(folderPath, 'verification.html');
  fs.writeFileSync(verificationFile, buildVerificationHtml(folderName), 'utf8');
}

function syncAllVerificationFiles() {
  const entries = fs.readdirSync(SCRIPTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      ensureVerificationHtml(entry.name, path.join(SCRIPTS_DIR, entry.name));
    }
  }
}

syncAllVerificationFiles();

fs.watch(SCRIPTS_DIR, { persistent: false }, (eventType, filename) => {
  if (!filename) return;
  const folderPath = path.join(SCRIPTS_DIR, filename);
  if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
    ensureVerificationHtml(filename, folderPath);
  }
});

function readScriptFolder(folderName, folderPath) {
  const scriptFile = path.join(folderPath, 'script.txt');
  const descFile = path.join(folderPath, 'description.txt');
  const iconFile = path.join(folderPath, 'icon.png');

  if (!fs.existsSync(scriptFile) || !fs.statSync(scriptFile).isFile()) {
    return null;
  }

  ensureVerificationHtml(folderName, folderPath);

  const stats = fs.statSync(scriptFile);
  const rawText = fs.readFileSync(scriptFile, 'utf8');

  let description = '';
  if (fs.existsSync(descFile) && fs.statSync(descFile).isFile()) {
    description = fs.readFileSync(descFile, 'utf8').trim();
  }
  if (!description) {
    description = 'HyperCheat script';
  }

  const encoded = encodeURIComponent(folderName);
  const hasIcon = fs.existsSync(iconFile) && fs.statSync(iconFile).isFile();

  return {
    name: folderName,
    folder: folderName,
    rawText,
    description,
    size: `${(stats.size / 1024).toFixed(2)} KB`,
    hasIcon,
    iconUrl: hasIcon ? `/api/icon/${encoded}` : null,
    verifyUrl: `/verify/${encoded}`
  };
}

app.get('/api/list', (req, res) => {
  fs.readdir(SCRIPTS_DIR, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ error: 'Failed to read scripts folder.' });

    const scripts = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readScriptFolder(entry.name, path.join(SCRIPTS_DIR, entry.name)))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(scripts.map(({ rawText, ...meta }) => meta));
  });
});

app.get('/api/icon/:folder', (req, res) => {
  const target = resolveSafeFolder(req.params.folder);
  if (!target) return res.status(400).end();

  const iconPath = path.join(target.full, 'icon.png');
  if (!fs.existsSync(iconPath)) return res.status(404).end();

  res.setHeader('Content-Type', 'image/png');
  fs.createReadStream(iconPath).pipe(res);
});

app.get('/verify/:folder', (req, res) => {
  const target = resolveSafeFolder(req.params.folder);
  if (!target || !fs.existsSync(target.full)) {
    return res.status(404).type('text/plain').send('Script folder not found.');
  }

  ensureVerificationHtml(target.safeFolder, target.full);
  res.sendFile(path.join(target.full, 'verification.html'));
});

app.get('/api/countdown/start', (req, res) => {
  const folder = String(req.query.folder || '');
  const sessionId = crypto.randomBytes(16).toString('hex');
  const now = Date.now();

  activeCountdowns.set(sessionId, {
    folder,
    readyAt: now + COUNTDOWN_SECONDS * 1000,
    expiresAt: now + 10 * 60 * 1000
  });

  res.json({
    sessionId,
    seconds: COUNTDOWN_SECONDS
  });
});

app.post('/api/countdown/complete', (req, res) => {
  const { sessionId, folder } = req.body || {};
  const record = activeCountdowns.get(sessionId);

  if (!record || record.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Session expired. Refresh the page.' });
  }

  if (Date.now() < record.readyAt) {
    const remaining = Math.ceil((record.readyAt - Date.now()) / 1000);
    return res.status(425).json({ error: `Please wait ${remaining} more second(s).` });
  }

  activeCountdowns.delete(sessionId);

  const target = resolveSafeFolder(folder || record.folder);
  if (!target) return res.status(404).json({ error: 'Folder not found.' });

  const item = readScriptFolder(target.safeFolder, target.full);
  if (!item) return res.status(404).json({ error: 'script.txt not found.' });

  const token = crypto.randomBytes(20).toString('hex');
  verifiedTokens.set(token, {
    folder: target.safeFolder,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  res.json({
    ok: true,
    rawText: item.rawText,
    rawEndpoint: `/api/raw/${encodeURIComponent(target.safeFolder)}?token=${token}`
  });
});

app.get('/api/raw/:folder', (req, res) => {
  const target = resolveSafeFolder(req.params.folder);
  if (!target) return res.status(400).type('text/plain').send('Invalid folder.');

  const token = String(req.query.token || '');
  const session = verifiedTokens.get(token);

  if (!session || session.folder !== target.safeFolder || session.expiresAt < Date.now()) {
    return res.redirect(`/verify/${encodeURIComponent(target.safeFolder)}`);
  }

  const item = readScriptFolder(target.safeFolder, target.full);
  if (!item) return res.status(404).type('text/plain').send('Not found.');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(item.rawText);
});

app.listen(PORT, () => {
  console.log(`HyperCheat running at http://localhost:${PORT}`);
  console.log(`Scripts directory: ${SCRIPTS_DIR}`);
});