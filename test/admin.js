import { requireAuth, htmlResponse, secureHeaders } from './utils.js';

export async function handleAdmin(request, env, path) {
  const userCount = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
  if (userCount.c === 0) {
    return new Response(setupPage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  const user = await requireAuth(request, env);
  if (!user) {
    const siteKey = env.TURNSTILE_SITE_KEY || '';
    return new Response(loginPage(siteKey), {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  return new Response(adminPage(user.username, env.APP_TITLE || 'File Hosting'), {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', ...secureHeaders() },
  });
}

function setupPage() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup Admin</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
<div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-sm border border-white/20 shadow-2xl">
  <div class="text-center mb-6">
    <div class="w-16 h-16 bg-indigo-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
      <i class="fa-solid fa-cloud-arrow-up text-indigo-300 text-2xl"></i>
    </div>
    <h1 class="text-white text-2xl font-bold">Setup Pertama</h1>
    <p class="text-slate-400 text-sm mt-1">Buat akun admin untuk mulai menggunakan</p>
  </div>
  <div id="msg" class="hidden rounded-lg p-3 text-sm mb-4 text-center"></div>
  <div class="space-y-4">
    <div class="relative">
      <i class="fa-solid fa-user text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
      <input id="username" type="text" placeholder="Username admin"
        class="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400">
    </div>
    <div class="relative">
      <i class="fa-solid fa-lock text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
      <input id="password" type="password" placeholder="Password (min 8 karakter)"
        class="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400">
    </div>
    <button onclick="setup()"
      class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
      <i class="fa-solid fa-rocket"></i> Buat Admin & Mulai
    </button>
  </div>
</div>
<script>
async function setup() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || password.length < 8) { showMsg('Username wajib & password min 8 karakter', 'error'); return; }
  const res = await fetch('/auth/setup', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (res.ok) { showMsg('Berhasil! Mengalihkan...', 'success'); setTimeout(() => location.reload(), 1500); }
  else showMsg(data.error || 'Gagal setup', 'error');
}
function showMsg(text, type) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = 'rounded-lg p-3 text-sm mb-4 text-center ' + (type==='error'
    ? 'bg-red-500/20 border border-red-500/50 text-red-300'
    : 'bg-green-500/20 border border-green-500/50 text-green-300');
  el.classList.remove('hidden');
}
</script>
</body></html>`;
}

function loginPage(siteKey = '') {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login Admin</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  body { background: #ffffff; }
  .card-shadow { box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04); }
  input::placeholder { color: #9ca3af; }
  input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
  .btn-login { background: #2563eb; transition: background 0.15s; }
  .btn-login:hover { background: #1d4ed8; }
  .btn-login:active { background: #1e40af; }
  /* Turnstile container center */
  .cf-turnstile { display: flex; justify-content: center; }
</style>
</head>
<body class="min-h-screen bg-white flex items-center justify-center p-4">
<div class="bg-white rounded-2xl p-8 w-full max-w-sm card-shadow border border-gray-100">

  <!-- Logo & Judul -->
  <div class="text-center mb-7">
    <div class="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
      <i class="fa-solid fa-shield-halved text-white text-xl"></i>
    </div>
    <h1 class="text-gray-900 text-2xl font-bold tracking-tight">Admin Login</h1>
    <p class="text-gray-500 text-sm mt-1">File Hosting Dashboard</p>
  </div>

  <!-- Error box -->
  <div id="error" class="hidden bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm mb-5 text-center flex items-center gap-2 justify-center">
    <i class="fa-solid fa-circle-exclamation"></i>
    <span id="error-text"></span>
  </div>

  <!-- Form -->
  <div class="space-y-4">
    <!-- Username -->
    <div class="relative">
      <i class="fa-solid fa-user text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 text-sm"></i>
      <input id="username" type="text" placeholder="Username" autocomplete="username"
        class="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-gray-900 text-sm focus:outline-none transition-all">
    </div>
    <!-- Password -->
    <div class="relative">
      <i class="fa-solid fa-key text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 text-sm"></i>
      <input id="password" type="password" placeholder="Password" autocomplete="current-password"
        class="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-gray-900 text-sm focus:outline-none transition-all">
    </div>

    <!-- Cloudflare Turnstile CAPTCHA -->
    ${siteKey ? `
    <div class="cf-turnstile"
      data-sitekey="${siteKey}"
      data-theme="light"
      data-callback="onTurnstileSuccess"
      data-error-callback="onTurnstileError"
      data-expired-callback="onTurnstileExpired"
      id="ts-widget"></div>
    ` : `
    <!-- [DEV] TURNSTILE_SITE_KEY belum diset di wrangler.toml -->
    <input type="hidden" id="cf-turnstile-response" value="dev-bypass">
    `}

    <!-- Tombol Login — disabled sampai Turnstile selesai -->
    <button id="btn-login" onclick="login()" disabled
      class="btn-login w-full text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 text-sm mt-1 opacity-50 cursor-not-allowed">
      <i class="fa-solid fa-circle-notch fa-spin"></i> Menunggu CAPTCHA...
    </button>
  </div>

  <p class="text-center text-xs text-gray-400 mt-6">
    Dilindungi oleh <span class="text-orange-500 font-medium">Cloudflare Turnstile</span>
  </p>
</div>

<script>
let tsToken = '';

// Dipanggil Turnstile saat verifikasi berhasil
function onTurnstileSuccess(token) {
  tsToken = token;
  const btn = document.getElementById('btn-login');
  btn.disabled = false;
  btn.classList.remove('opacity-50', 'cursor-not-allowed');
  btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk';
}

// Dipanggil Turnstile saat token expired
function onTurnstileExpired() {
  tsToken = '';
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.classList.add('opacity-50', 'cursor-not-allowed');
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> CAPTCHA expired, refresh...';
  if (typeof turnstile !== 'undefined') turnstile.reset();
}

// Dipanggil Turnstile saat error
function onTurnstileError() {
  tsToken = '';
  showErr('CAPTCHA error. Refresh halaman dan coba lagi.');
}

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showErr('Username dan password wajib diisi');
    return;
  }

  // Gunakan token dari callback, bukan dari DOM query
  const turnstileToken = tsToken ||
    (document.querySelector('input[name="cf-turnstile-response"]') || {}).value || '';

  if (!turnstileToken) {
    showErr('Selesaikan verifikasi CAPTCHA terlebih dahulu');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memverifikasi...';

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, turnstileToken })
    });
    const data = await res.json();
    if (res.ok) {
      location.reload();
    } else {
      showErr(data.error || 'Login gagal');
      tsToken = '';
      if (typeof turnstile !== 'undefined') turnstile.reset();
    }
  } catch (e) {
    showErr('Koneksi gagal. Coba lagi.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk';
  }
}

function showErr(msg) {
  const box = document.getElementById('error');
  document.getElementById('error-text').textContent = msg;
  box.classList.remove('hidden');
  box.classList.add('flex');
}

document.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
</script>
</body></html>`;
}


function adminPage(username, title) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} — Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
/* ── Reset & Base ─────────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{height:100%;font-size:14px}
body{height:100%;font-family:'Inter',ui-sans-serif,sans-serif;background:#F8FAFC;color:#0F172A;line-height:1.5;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
button{cursor:pointer;font-family:inherit}
input,select,textarea{font-family:inherit}

/* ── Layout ───────────────────────────────────────────────────────── */
.app{display:flex;height:100vh;overflow:hidden}
.sidebar{width:240px;background:#fff;border-right:1px solid #E2E8F0;display:flex;flex-direction:column;flex-shrink:0;transition:transform .25s}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.topbar{height:56px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;padding:0 24px;gap:12px;flex-shrink:0}
.content{flex:1;overflow-y:auto;padding:24px}

/* ── Sidebar ──────────────────────────────────────────────────────── */
.sidebar-header{padding:20px 20px 16px;border-bottom:1px solid #F1F5F9}
.sidebar-brand{display:flex;align-items:center;gap:10px}
.brand-icon{width:34px;height:34px;background:#6366F1;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand-icon i{color:#fff;font-size:14px}
.brand-name{font-size:13px;font-weight:700;color:#0F172A;letter-spacing:-.01em;line-height:1.2}
.brand-sub{font-size:11px;color:#94A3B8;margin-top:1px}

.sidebar-nav{flex:1;padding:12px 10px;display:flex;flex-direction:column;gap:2px}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:#64748B;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border:none;background:none;width:100%;text-align:left;position:relative}
.nav-item:hover{color:#0F172A;background:#F8FAFC}
.nav-item.active{color:#6366F1;background:#EEF2FF;font-weight:600}
.nav-item.active::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:20px;background:#6366F1;border-radius:0 2px 2px 0;margin-left:-10px}
.nav-item i{width:16px;text-align:center;font-size:13px;flex-shrink:0}
.nav-sep{height:1px;background:#F1F5F9;margin:8px 0}

.sidebar-footer{padding:12px 10px;border-top:1px solid #F1F5F9}
.user-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;margin-bottom:4px}
.user-avatar{width:30px;height:30px;background:#EEF2FF;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#6366F1;flex-shrink:0}
.user-name{font-size:12px;font-weight:600;color:#0F172A}
.user-role{font-size:11px;color:#94A3B8}
.btn-logout{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;color:#94A3B8;font-size:12px;font-weight:500;background:none;border:none;width:100%;transition:all .15s}
.btn-logout:hover{color:#EF4444;background:#FFF5F5}

/* ── Topbar ───────────────────────────────────────────────────────── */
.topbar-title{font-size:14px;font-weight:600;color:#0F172A}
.topbar-spacer{flex:1}
.mobile-menu-btn{display:none;width:36px;height:36px;align-items:center;justify-content:center;border-radius:8px;border:1px solid #E2E8F0;background:#fff;color:#64748B}
.mobile-menu-btn:hover{background:#F8FAFC}

/* ── Page header ──────────────────────────────────────────────────── */
.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px}
.page-title{font-size:18px;font-weight:700;color:#0F172A;letter-spacing:-.02em}
.page-sub{font-size:12px;color:#94A3B8;margin-top:2px;font-weight:400}

/* ── Stat cards ───────────────────────────────────────────────────── */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
.stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:20px;position:relative;overflow:hidden}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent,#6366F1);border-radius:12px 12px 0 0}
.stat-card-label{font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.stat-card-value{font-size:26px;font-weight:700;color:#0F172A;letter-spacing:-.03em;line-height:1}
.stat-card-sub{font-size:11px;color:#CBD5E1;margin-top:6px}
.stat-card-icon{position:absolute;right:16px;top:50%;transform:translateY(-50%);width:36px;height:36px;background:#F8FAFC;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#CBD5E1;font-size:14px}

/* ── Cards ────────────────────────────────────────────────────────── */
.card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden}
.card-header{padding:16px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:13px;font-weight:600;color:#0F172A}
.card-body{padding:0}

/* ── Buttons ──────────────────────────────────────────────────────── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;border:none;transition:all .15s;cursor:pointer;white-space:nowrap}
.btn-primary{background:#6366F1;color:#fff}.btn-primary:hover{background:#4F46E5}
.btn-success{background:#10B981;color:#fff}.btn-success:hover{background:#059669}
.btn-neutral{background:#F8FAFC;color:#475569;border:1px solid #E2E8F0}.btn-neutral:hover{background:#F1F5F9}
.btn-danger{background:#FFF5F5;color:#EF4444;border:1px solid #FECACA}.btn-danger:hover{background:#FEE2E2}
.btn-sm{padding:5px 10px;font-size:11px;border-radius:6px}
.btn-icon{width:28px;height:28px;padding:0;justify-content:center;border-radius:6px;border:1px solid #E2E8F0;background:#fff;color:#94A3B8}.btn-icon:hover{background:#F8FAFC;color:#475569}
.btn-icon.danger:hover{background:#FFF5F5;color:#EF4444;border-color:#FECACA}

/* ── Table / File manager ─────────────────────────────────────────── */
.fm-header{display:grid;align-items:center;padding:8px 16px;background:#F8FAFC;border-bottom:1px solid #E2E8F0}
.fm-header span{font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em}
.fm-row{display:grid;align-items:center;padding:9px 16px;border-bottom:1px solid #F8FAFC;transition:background .1s;cursor:default}
.fm-row:last-child{border-bottom:none}
.fm-row:hover{background:#FAFBFF}
.fm-row.selected{background:#EEF2FF}

/* Grid classes */
.fm-grid-folder{grid-template-columns:1fr 72px 88px 88px 80px}
.fm-grid-file{grid-template-columns:1fr 88px 100px 60px}

/* Mobile: sembunyikan kolom tengah */
@media(max-width:640px){
  .fm-col-md{display:none !important}
  .fm-grid-folder{grid-template-columns:1fr 80px !important}
  .fm-grid-file{grid-template-columns:1fr 60px !important}
  .fm-name span{max-width:calc(100vw - 160px)}
  .stat-grid{grid-template-columns:1fr 1fr !important}
  .page-header{flex-direction:column;align-items:flex-start !important}
}
.fm-name{display:flex;align-items:center;gap:9px;min-width:0;overflow:hidden}
.fm-name i.folder-icon{color:#F59E0B;font-size:14px;flex-shrink:0}
.fm-name span{font-size:13px;color:#1E293B;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.fm-cell{font-size:12px;color:#94A3B8;text-align:center}
.fm-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px}

/* ── Badges ───────────────────────────────────────────────────────── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
.badge-green{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}
.badge-slate{background:#F8FAFC;color:#64748B;border:1px solid #E2E8F0}
.badge-amber{background:#FFFBEB;color:#D97706;border:1px solid #FDE68A}
.badge-indigo{background:#EEF2FF;color:#6366F1;border:1px solid #C7D2FE}
.badge-red{background:#FFF5F5;color:#EF4444;border:1px solid #FECACA}

/* ── Upload zone ──────────────────────────────────────────────────── */
.drop-zone{border:2px dashed #E2E8F0;border-radius:10px;padding:28px;text-align:center;cursor:pointer;transition:all .2s;background:#FAFBFF}
.drop-zone:hover,.drop-zone.drag-over{border-color:#6366F1;background:#EEF2FF}
.drop-zone i{font-size:28px;color:#CBD5E1;display:block;margin-bottom:8px}
.drop-zone p{font-size:13px;color:#94A3B8;font-weight:500}
.drop-zone small{font-size:11px;color:#CBD5E1;margin-top:4px;display:block}

/* ── Progress ─────────────────────────────────────────────────────── */
.progress-wrap{height:4px;background:#F1F5F9;border-radius:4px;overflow:hidden;margin-top:6px}
.progress-bar{height:100%;background:#6366F1;border-radius:4px;transition:width .3s ease}

/* ── Modal ────────────────────────────────────────────────────────── */
.modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,0.4);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:50;padding:16px}
.modal-backdrop:not(.hidden){display:flex}
.modal{background:#fff;border-radius:14px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.12),0 4px 16px rgba(0,0,0,.08)}
.modal-header{padding:20px 24px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:flex-start;justify-content:space-between}
.modal-title{font-size:15px;font-weight:700;color:#0F172A}
.modal-sub{font-size:12px;color:#94A3B8;margin-top:2px}
.modal-close{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #E2E8F0;background:#fff;color:#94A3B8;flex-shrink:0}.modal-close:hover{background:#F8FAFC;color:#475569}
.modal-body{padding:20px 24px}
.modal-footer{padding:16px 24px;border-top:1px solid #F1F5F9;display:flex;gap:10px;justify-content:flex-end}

/* ── Form fields ──────────────────────────────────────────────────── */
.field{margin-bottom:14px}
.field label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px}
.field input,.field select{width:100%;padding:8px 12px;border:1px solid #E2E8F0;border-radius:7px;font-size:13px;color:#0F172A;background:#fff;outline:none;transition:border .15s}
.field input:focus,.field select:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,.1)}
.field input::placeholder{color:#CBD5E1}
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0}
.toggle-label{font-size:13px;font-weight:500;color:#374151}
.toggle-sub{font-size:11px;color:#94A3B8;margin-top:1px}
.toggle{width:38px;height:22px;background:#E2E8F0;border-radius:11px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;border:none}
.toggle.on{background:#6366F1}
.toggle::after{content:'';position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.toggle.on::after{transform:translateX(16px)}

/* ── Alert / status ───────────────────────────────────────────────── */
.alert{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;font-size:12px;font-weight:500}
.alert-err{background:#FFF5F5;color:#DC2626;border:1px solid #FECACA}
.alert-ok{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}
.alert-info{background:#EEF2FF;color:#6366F1;border:1px solid #C7D2FE}

/* ── Context menu ─────────────────────────────────────────────────── */
.ctx-menu{position:fixed;z-index:100;background:#fff;border:1px solid #E2E8F0;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.1);padding:4px;min-width:180px}
.ctx-item{display:flex;align-items:center;gap:9px;padding:7px 12px;border-radius:6px;font-size:12px;color:#475569;cursor:pointer;background:none;border:none;width:100%;text-align:left}
.ctx-item:hover{background:#F8FAFC;color:#0F172A}
.ctx-item.danger{color:#EF4444}.ctx-item.danger:hover{background:#FFF5F5}
.ctx-item i{width:14px;text-align:center;font-size:12px;color:#94A3B8}
.ctx-item.danger i{color:#FECACA}
.ctx-sep{height:1px;background:#F1F5F9;margin:4px 0}
.ctx-label{padding:4px 12px 4px;font-size:11px;color:#94A3B8;font-weight:600;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ── Breadcrumb ───────────────────────────────────────────────────── */
.breadcrumb{display:flex;align-items:center;gap:6px;font-size:12px;color:#94A3B8}
.breadcrumb a,.breadcrumb button{color:#94A3B8;background:none;border:none;cursor:pointer;font-size:12px;padding:0}
.breadcrumb a:hover,.breadcrumb button:hover{color:#6366F1}
.breadcrumb-sep{color:#E2E8F0}
.breadcrumb-current{color:#0F172A;font-weight:600}

/* ── Status bar ───────────────────────────────────────────────────── */
.statusbar{font-size:11px;color:#CBD5E1;padding:6px 0 0;display:flex;align-items:center;gap:8px}

/* ── Empty state ──────────────────────────────────────────────────── */
.empty{text-align:center;padding:48px 20px;color:#94A3B8}
.empty i{font-size:36px;color:#E2E8F0;display:block;margin-bottom:12px}
.empty p{font-size:13px;font-weight:500;margin-bottom:4px;color:#64748B}
.empty small{font-size:12px}

/* ── Scrollbar ────────────────────────────────────────────────────── */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:#CBD5E1}

/* ── Utility ──────────────────────────────────────────────────────── */
.hidden{display:none !important}
.page{display:block}
.page.hidden{display:none !important}

/* ── Animations ───────────────────────────────────────────────────── */
.fade-in{animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* ── Queue file item ──────────────────────────────────────────────── */
.queue-item{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px}
.queue-item-row{display:flex;align-items:center;gap:8px}
.queue-item-name{font-size:12px;color:#1E293B;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.queue-item-size{font-size:11px;color:#94A3B8;flex-shrink:0}

/* ── Security settings ────────────────────────────────────────────── */
.settings-section{margin-bottom:24px}
.settings-title{font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #F1F5F9}
.settings-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #F8FAFC}
.settings-row:last-child{border-bottom:none}
.settings-row-label{font-size:13px;font-weight:500;color:#1E293B}
.settings-row-sub{font-size:11px;color:#94A3B8;margin-top:2px}
.settings-input{width:100px;padding:5px 8px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;color:#0F172A;text-align:right}
.settings-input:focus{outline:none;border-color:#6366F1}

/* ── Mobile ───────────────────────────────────────────────────────── */
@media(max-width:768px){
  .sidebar{position:fixed;z-index:40;height:100%;transform:translateX(-100%);box-shadow:4px 0 20px rgba(0,0,0,.08)}
  .sidebar.open{transform:translateX(0)}
  #sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.3);z-index:39;opacity:0;pointer-events:none;transition:opacity .25s}
  #sidebar-overlay.open{display:block;opacity:1;pointer-events:auto}
  .mobile-menu-btn{display:flex !important}
  .stat-grid{grid-template-columns:1fr 1fr}
  .content{padding:16px}
}
</style>
</head>
<body>
<div class="app">

<!-- Sidebar overlay (mobile) -->
<div id="sidebar-overlay" onclick="closeSidebar()"></div>

<!-- Sidebar -->
<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-brand">
      <div class="brand-icon"><i class="fa-solid fa-hard-drive"></i></div>
      <div>
        <div class="brand-name">${title}</div>
        <div class="brand-sub">Admin Panel</div>
      </div>
    </div>
  </div>

  <nav class="sidebar-nav">
    <button class="nav-item active" id="nav-dashboard" onclick="showPage('dashboard');closeSidebar()">
      <i class="fa-solid fa-gauge"></i> Dashboard
    </button>
    <button class="nav-item" id="nav-folders" onclick="showPage('folders');closeSidebar()">
      <i class="fa-solid fa-folder"></i> Folder
    </button>
    <div class="nav-sep"></div>
    <button class="nav-item" id="nav-gdrive" onclick="showPage('gdrive');closeSidebar()">
      <i class="fa-brands fa-google-drive"></i> GDrive
    </button>
    <a class="nav-item" href="/admin/storage" style="padding-left:28px;font-size:12px;text-decoration:none">
      <i class="fa-solid fa-hard-drive"></i> Storage
    </a>
    <button class="nav-item" id="nav-gdrive-report" onclick="showPage('gdrive-report');closeSidebar()" style="padding-left:28px;font-size:12px">
      <i class="fa-solid fa-chart-bar"></i> Report Akun
    </button>
    <div class="nav-sep"></div>
    <button class="nav-item" id="nav-security" onclick="showPage('security');closeSidebar()">
      <i class="fa-solid fa-shield-halved"></i> Keamanan
    </button>
  </nav>

  <div class="sidebar-footer">
    <div class="user-row">
      <div class="user-avatar">${username.charAt(0).toUpperCase()}</div>
      <div>
        <div class="user-name">${username}</div>
        <div class="user-role">Administrator</div>
      </div>
    </div>
    <button class="btn-logout" onclick="logout()">
      <i class="fa-solid fa-arrow-right-from-bracket"></i> Keluar
    </button>
  </div>
</aside>

<!-- Main -->
<div class="main">

  <!-- Topbar -->
  <header class="topbar">
    <button class="mobile-menu-btn" id="mobile-menu-btn" onclick="openSidebar()">
      <i class="fa-solid fa-bars" style="font-size:13px"></i>
    </button>
    <span class="topbar-title" id="topbar-title">Dashboard</span>
    <div class="topbar-spacer"></div>
    <span style="font-size:11px;color:#CBD5E1;font-weight:500" id="topbar-time"></span>
  </header>

  <!-- Pages -->
  <div class="content">

  <!-- ── PAGE: DASHBOARD ───────────────────────────────────────────── -->
  <div id="page-dashboard" class="page hidden">
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-sub">Ringkasan penyimpanan dan aktivitas</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-neutral btn-sm" onclick="openUploadModal(null)">
          <i class="fa-solid fa-upload"></i> Upload File
        </button>
        <button class="btn btn-primary btn-sm" onclick="openFolderModal()">
          <i class="fa-solid fa-folder-plus"></i> Folder Baru
        </button>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="stat-grid">
      <div class="stat-card" style="--accent:#6366F1">
        <div class="stat-card-label">Total Folder</div>
        <div class="stat-card-value" id="stat-folders">—</div>
        <div class="stat-card-sub" id="stat-folders-sub">memuat...</div>
        <div class="stat-card-icon"><i class="fa-solid fa-folder"></i></div>
      </div>
      <div class="stat-card" style="--accent:#10B981">
        <div class="stat-card-label">Total File</div>
        <div class="stat-card-value" id="stat-files">—</div>
        <div class="stat-card-sub" id="stat-files-sub">memuat...</div>
        <div class="stat-card-icon"><i class="fa-solid fa-file"></i></div>
      </div>
      <div class="stat-card" style="--accent:#F59E0B">
        <div class="stat-card-label">Storage Digunakan</div>
        <div class="stat-card-value" id="stat-size">—</div>
        <div class="stat-card-sub" id="stat-size-sub">R2 + GDrive</div>
        <div class="stat-card-icon"><i class="fa-solid fa-database"></i></div>
      </div>
      <div class="stat-card" style="--accent:#EC4899">
        <div class="stat-card-label">File Publik</div>
        <div class="stat-card-value" id="stat-public">—</div>
        <div class="stat-card-sub">akses via /public/</div>
        <div class="stat-card-icon"><i class="fa-solid fa-globe"></i></div>
      </div>
    </div>

    <!-- Recent folders -->
    <div class="card fade-in">
      <div class="card-header">
        <span class="card-title">Folder Terbaru</span>
        <button class="btn btn-neutral btn-sm" onclick="showPage('folders')">
          Lihat semua <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
      <div id="recent-folders" class="card-body">
        <div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat...</p></div>
      </div>
    </div>
  </div>

  <!-- ── PAGE: FOLDERS ─────────────────────────────────────────────── -->
  <div id="page-folders" class="page hidden">
    <div class="page-header">
      <div>
        <div class="breadcrumb" id="fm-breadcrumb">
          <i class="fa-solid fa-hard-drive" style="font-size:11px"></i>
          <span class="breadcrumb-current">Semua Folder</span>
        </div>
        <div class="page-title" style="margin-top:4px" id="fm-page-title">Folder</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span id="fm-selected-info" style="font-size:11px;color:#94A3B8;display:none"></span>
        <button class="btn btn-neutral btn-sm" onclick="viewPublicFiles()">
          <i class="fa-solid fa-globe"></i> File Publik
        </button>
        <button class="btn btn-neutral btn-sm" onclick="openUploadModal(null)">
          <i class="fa-solid fa-upload"></i> Upload
        </button>
        <button class="btn btn-primary btn-sm" onclick="openFolderModal()">
          <i class="fa-solid fa-folder-plus"></i> Folder Baru
        </button>
      </div>
    </div>

    <div class="card">
      <div class="fm-header fm-grid-folder">
        <span>Nama Folder</span>
        <span class="fm-col-md" style="text-align:center">File</span>
        <span class="fm-col-md" style="text-align:center">Akses</span>
        <span class="fm-col-md" style="text-align:center">Password</span>
        <span style="text-align:right">Aksi</span>
      </div>
      <div id="folders-list">
        <div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat...</p></div>
      </div>
    </div>
    <div class="statusbar" id="fm-statusbar"></div>
  </div>

  <!-- ── PAGE: FILES (dalam folder) ────────────────────────────────── -->
  <div id="page-files" class="page hidden">
    <div class="page-header">
      <div>
        <div class="breadcrumb">
          <button onclick="showPage('folders')"><i class="fa-solid fa-hard-drive" style="font-size:11px"></i> Semua Folder</button>
          <span class="breadcrumb-sep"><i class="fa-solid fa-chevron-right" style="font-size:9px"></i></span>
          <span class="breadcrumb-current" id="files-folder-name">—</span>
          <span id="files-folder-badges" style="display:flex;gap:4px;align-items:center;margin-left:4px"></span>
        </div>
        <div class="page-title" style="margin-top:4px">Isi Folder</div>
      </div>
      <button class="btn btn-success btn-sm" onclick="openUploadModal(currentFolderId)">
        <i class="fa-solid fa-upload"></i> Upload ke Folder Ini
      </button>
    </div>

    <div class="card">
      <div class="fm-header fm-grid-file">
        <span>Nama File</span>
        <span class="fm-col-md" style="text-align:center">Ukuran</span>
        <span class="fm-col-md" style="text-align:center">Tanggal</span>
        <span style="text-align:right">Aksi</span>
      </div>
      <div id="files-list">
        <div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat...</p></div>
      </div>
    </div>
    <div class="statusbar" id="files-statusbar"></div>
  </div>

  <!-- ── PAGE: GDRIVE AKUN ────────────────────────────────────────── -->
  <div id="page-gdrive" class="page hidden">
    <div class="page-header">
      <div>
        <div class="page-title">Google Drive</div>
        <div class="page-sub">Kelola akun penyimpanan Google Drive</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-neutral btn-sm" onclick="syncGDriveQuota()">
          <i class="fa-solid fa-rotate"></i> Sync Quota
        </button>
        <button class="btn btn-primary btn-sm" onclick="openGDriveModal()">
          <i class="fa-solid fa-plus"></i> Tambah Akun
        </button>
      </div>
    </div>
    <div id="gdrive-msg" style="margin-bottom:12px;display:none"></div>
    <div id="gdrive-accounts-list">
      <div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat...</p></div>
    </div>
  </div>

  <!-- ── PAGE: GDRIVE REPORT ───────────────────────────────────────── -->
  <div id="page-gdrive-report" class="page hidden">
    <div class="page-header">
      <div>
        <div class="page-title">Report Akun GDrive</div>
        <div class="page-sub">Monitoring storage semua akun Google Drive</div>
      </div>
      <button class="btn btn-neutral btn-sm" onclick="loadGDriveReport()">
        <i class="fa-solid fa-rotate"></i> Refresh
      </button>
    </div>
    <div id="gdrive-report-content">
      <div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat...</p></div>
    </div>
  </div>

  <!-- ── PAGE: SECURITY ────────────────────────────────────────────── -->
  <div id="page-security" class="page hidden">
    <div class="page-header">
      <div>
        <div class="page-title">Keamanan</div>
        <div class="page-sub">Konfigurasi proteksi dan akses</div>
      </div>
      <button class="btn btn-primary btn-sm" id="save-security-btn" onclick="saveSecuritySettings()">
        <i class="fa-solid fa-floppy-disk"></i> Simpan Pengaturan
      </button>
    </div>

    <div id="security-msg" style="margin-bottom:16px;display:none"></div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Proteksi Login (Anti Brute-Force)</span></div>
      <div class="card-body" style="padding:0 20px">
        <div style="padding:12px 0;border-bottom:1px solid #F8FAFC">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div>
              <div class="settings-row-label">Maks. Percobaan Login Gagal</div>
              <div class="settings-row-sub">Akun terkunci setelah melebihi batas ini</div>
            </div>
            <input type="number" id="set-login-max" class="settings-input" value="3" min="1" max="20">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div class="settings-row-label">Durasi Lockout (menit)</div>
              <div class="settings-row-sub">Berapa lama akun terkunci setelah gagal</div>
            </div>
            <input type="number" id="set-lockout-min" class="settings-input" value="60" min="1" max="1440">
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Rate Limit & Akses</span></div>
      <div class="card-body" style="padding:0 20px">
        <div class="toggle-row">
          <div>
            <div class="toggle-label">Rate Limiting</div>
            <div class="toggle-sub">Batasi jumlah request per IP per menit</div>
          </div>
          <button class="toggle" id="toggle-rate-limit" onclick="toggleSetting(this)" aria-label="Toggle rate limit"></button>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid #F8FAFC">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span class="settings-row-label" style="font-size:12px">Max req/menit (browser)</span>
            <input type="number" id="set-browser-max" class="settings-input" value="120" min="10" max="1000">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="settings-row-label" style="font-size:12px">Max req/menit (CLI / wget / curl)</span>
            <input type="number" id="set-cli-max" class="settings-input" value="60" min="5" max="500">
          </div>
        </div>
        <div class="toggle-row">
          <div>
            <div class="toggle-label">Izinkan CLI Downloader</div>
            <div class="toggle-sub">wget, curl, aria2 bisa mengakses file publik</div>
          </div>
          <button class="toggle" id="toggle-cli" onclick="toggleSetting(this)" aria-label="Toggle CLI"></button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Informasi Sistem</span></div>
      <div class="card-body" style="padding:16px 20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#94A3B8;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Runtime</div>
            <div style="font-size:13px;color:#1E293B;font-weight:600">Cloudflare Workers</div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#94A3B8;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Storage</div>
            <div style="font-size:13px;color:#1E293B;font-weight:600">Cloudflare R2</div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#94A3B8;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Database</div>
            <div style="font-size:13px;color:#1E293B;font-weight:600">Cloudflare D1</div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#94A3B8;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">CAPTCHA</div>
            <div style="font-size:13px;color:#1E293B;font-weight:600">Cloudflare Turnstile</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  </div><!-- /.content -->
</div><!-- /.main -->
</div><!-- /.app -->

<!-- ── MODAL: FOLDER ──────────────────────────────────────────────────────── -->
<div id="folder-modal" class="modal-backdrop hidden">
  <div class="modal">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="folder-modal-title">Folder Baru</div>
        <div class="modal-sub">Isi detail folder di bawah ini</div>
      </div>
      <button class="modal-close" onclick="closeFolderModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div id="modal-msg" style="margin-bottom:12px;display:none"></div>
      <div class="field">
        <label>Nama Folder</label>
        <input id="folder-name" type="text" placeholder="cth: Dokumen Proyek 2024">
      </div>
      <div class="toggle-row" style="border-bottom:1px solid #F1F5F9;padding-bottom:14px;margin-bottom:14px">
        <div>
          <div class="toggle-label">Akses Publik</div>
          <div class="toggle-sub">Dapat diakses tanpa login via link</div>
        </div>
        <button class="toggle" id="folder-public-toggle" onclick="toggleFolderPublic(this)" aria-label="Toggle public"></button>
        <input type="hidden" id="folder-public" value="0">
      </div>
      <div id="password-section" style="display:none">
        <div class="field" style="margin-bottom:8px">
          <label>Password Folder <span style="color:#94A3B8;font-weight:400">(opsional)</span></label>
          <input id="folder-password" type="password" placeholder="Kosongkan jika tidak diubah">
        </div>
        <div id="remove-pass-row" style="display:none;align-items:center;gap:8px;margin-bottom:14px">
          <input type="checkbox" id="remove-password" style="width:14px;height:14px;accent-color:#EF4444">
          <label for="remove-password" style="font-size:12px;color:#EF4444;cursor:pointer;font-weight:500">Hapus password (jadikan tanpa password)</label>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-neutral" onclick="closeFolderModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveFolder()"><i class="fa-solid fa-floppy-disk"></i> Simpan</button>
    </div>
  </div>
</div>

<!-- ── MODAL: UPLOAD ──────────────────────────────────────────────────────── -->
<div id="upload-modal" class="modal-backdrop hidden">
  <div class="modal" style="max-width:520px">
    <div class="modal-header">
      <div>
        <div class="modal-title">Upload File</div>
        <div class="modal-sub" id="upload-modal-dest">Memilih tujuan...</div>
      </div>
      <button class="modal-close" onclick="closeUploadModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div class="drop-zone" onclick="document.getElementById('modal-file-input').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');addModalFiles(event.dataTransfer.files)">
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <p>Klik atau seret file ke sini</p>
        <small>Hingga 95 MB per file — file besar diupload otomatis via multipart</small>
        <input type="file" id="modal-file-input" multiple style="display:none">
      </div>
      <div id="modal-upload-queue" style="margin-top:12px;display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-neutral" onclick="closeUploadModal()">Batal</button>
      <button id="modal-upload-btn" class="btn btn-success hidden" onclick="startModalUpload()">
        <i class="fa-solid fa-rocket"></i> Mulai Upload
      </button>
    </div>
  </div>
</div>

<!-- ── MODAL: GDRIVE TAMBAH AKUN ────────────────────────────────────────── -->
<div id="gdrive-modal" class="modal-backdrop hidden">
  <div class="modal" style="max-width:540px">
    <div class="modal-header">
      <div>
        <div class="modal-title">Tambah Akun Google Drive</div>
        <div class="modal-sub">Masukkan Refresh Token dari OAuth2</div>
      </div>
      <button class="modal-close" onclick="closeGDriveModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div id="gdrive-modal-msg" style="margin-bottom:12px;display:none"></div>
      <div class="field">
        <label>Label Akun <span style="color:#94A3B8;font-weight:400">(cth: Drive Utama, Drive Backup)</span></label>
        <input id="gd-label" type="text" placeholder="Drive Utama">
      </div>
      <div class="field">
        <label>Email Google <span style="color:#94A3B8;font-weight:400">(opsional, auto-detect)</span></label>
        <input id="gd-email" type="email" placeholder="nama@gmail.com">
      </div>
      <div class="field">
        <label>Refresh Token <span style="color:#EF4444;font-weight:600">*</span></label>
        <input id="gd-token" type="password" placeholder="1//0g... atau paste refresh token di sini">
      </div>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px;margin-top:4px">
        <div style="font-size:11px;font-weight:700;color:#16A34A;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">
          <i class="fa-solid fa-shield-check"></i> Keamanan
        </div>
        <div style="font-size:12px;color:#166534;line-height:1.6">
          Refresh token akan <strong>dienkripsi AES-256-GCM</strong> sebelum disimpan ke database.
          Kunci enkripsi ada di Worker secret — tidak pernah ada di database.
        </div>
      </div>
      <div style="background:#EEF2FF;border:1px solid #C7D2FE;border-radius:8px;padding:12px;margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:#6366F1;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">
          <i class="fa-solid fa-circle-info"></i> Cara Dapatkan Refresh Token
        </div>
        <div style="font-size:12px;color:#3730A3;line-height:1.6">
          Baca <strong>GDRIVE_SETUP.md</strong> di project kamu, atau lihat bagian setup
          di bawah halaman ini. Gunakan OAuth Playground atau script yang disediakan.
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-neutral" onclick="closeGDriveModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveGDriveAccount()" id="gd-save-btn">
        <i class="fa-solid fa-floppy-disk"></i> Simpan & Verifikasi
      </button>
    </div>
  </div>
</div>

<!-- ── DELETE CONFIRM ─────────────────────────────────────────────────────── -->
<div id="delete-modal" class="modal-backdrop hidden">
  <div class="modal" style="max-width:400px">
    <div class="modal-header">
      <div>
        <div class="modal-title" style="color:#EF4444">Hapus Item</div>
        <div class="modal-sub">Tindakan ini tidak dapat dibatalkan</div>
      </div>
      <button class="modal-close" onclick="closeDeleteModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div class="alert alert-err">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span id="delete-confirm-text">Yakin ingin menghapus item ini?</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-neutral" onclick="closeDeleteModal()">Batal</button>
      <button class="btn btn-danger" id="delete-confirm-btn">
        <i class="fa-solid fa-trash"></i> Hapus
      </button>
    </div>
  </div>
</div>

<script>
let folders = [];
let editingFolderId = null;
let uploadFiles = [];
let currentFolderId = null;
let fmSelected = null;
let modalUploadFolderId = null;
let modalUploadFiles = [];
let tsToken = '';
const PART_SIZE = 95 * 1024 * 1024;

// ── Clock ──────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('topbar-time');
  if (el) el.textContent = new Date().toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
}
updateClock(); setInterval(updateClock, 30000);

// ── Mobile sidebar ─────────────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/admin';
}

// ── Navigation ─────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard', folders: 'Folder',
  files: 'Isi Folder', security: 'Keamanan',
  gdrive: 'Google Drive', 'gdrive-report': 'Report GDrive'
};
function showPage(name) {
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.remove('hidden');
  const nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');
  if (name === 'files') {
    const nf = document.getElementById('nav-folders');
    if (nf) nf.classList.add('active');
  }
  const tb = document.getElementById('topbar-title');
  if (tb) tb.textContent = PAGE_TITLES[name] || name;
  if (name === 'dashboard') loadDashboard();
  if (name === 'folders') loadFolders();
  if (name === 'security') loadSecuritySettings();
  if (name === 'gdrive') loadGDriveAccounts();
  if (name === 'gdrive-report') loadGDriveReport();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  b = parseInt(b) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
  return (b/1073741824).toFixed(2) + ' GB';
}
function escHtml(s) {
  return String(s||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function safeFetch(url, opts = {}) {
  try { const r = await fetch(url, opts); return r; }
  catch (e) { console.error('fetch error', url, e); return null; }
}
async function api(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await safeFetch(url, { ...opts, headers });
  if (!res) return { ok: false, data: { error: 'Koneksi gagal' } };
  let data; try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  const { data } = await api('/api/stats');
  if (data && data.ok) {
    const r2 = data.r2 || {};
    const gd = data.gdrive || {};
    document.getElementById('stat-folders').textContent = data.folders ?? 0;
    document.getElementById('stat-files').textContent = data.files ?? 0;
    document.getElementById('stat-size').textContent = fmtBytes(data.total_size || 0);
    document.getElementById('stat-public').textContent = data.public_files ?? 0;
    document.getElementById('stat-folders-sub').textContent =
      \`R2: \${r2.folders||0} · GDrive: \${gd.folders||0}\`;
    document.getElementById('stat-files-sub').textContent =
      \`R2: \${r2.files||0} · GDrive: \${gd.files||0}\`;
    const sizeSub = document.getElementById('stat-size-sub');
    if (sizeSub) sizeSub.textContent = \`R2 \${fmtBytes(r2.total_size||0)} + GDrive \${fmtBytes(gd.total_size||0)}\`;
  }
  const rf = document.getElementById('recent-folders');
  if (!folders.length) {
    const { data: fd } = await api('/api/folders');
    folders = fd.folders || [];
  }
  if (!folders.length) {
    rf.innerHTML = \`<div class="empty"><i class="fa-solid fa-folder-open"></i><p>Belum ada folder</p><small>Buat folder pertama kamu</small></div>\`;
    return;
  }
  rf.innerHTML = folders.slice(0,8).map(f => \`
    <div style="display:flex;align-items:center;padding:10px 20px;border-bottom:1px solid #F8FAFC;gap:12px;cursor:pointer" onclick="viewFolder(\${f.id})" class="fm-row">
      <i class="fa-solid fa-folder" style="color:#F59E0B;font-size:14px;flex-shrink:0"></i>
      <span style="flex:1;font-size:13px;font-weight:500;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${escHtml(f.name)}</span>
      \${f.is_public ? '<span class="badge badge-green">Publik</span>' : '<span class="badge badge-slate">Private</span>'}
      \${f.password_hash ? '<span class="badge badge-amber"><i class="fa-solid fa-lock" style="font-size:9px"></i></span>' : ''}
      <span style="font-size:11px;color:#CBD5E1;flex-shrink:0">\${f.file_count||0} file</span>
      <button class="btn btn-neutral btn-sm" onclick="event.stopPropagation();openFolderModal(\${f.id})" style="flex-shrink:0">
        <i class="fa-solid fa-pen"></i>
      </button>
    </div>\`).join('');
}

// ── Folders ────────────────────────────────────────────────────────────────
async function loadFolders() {
  const { data } = await api('/api/folders');
  folders = data.folders || [];
  renderFolderList();
}

function renderFolderList() {
  const el = document.getElementById('folders-list');
  const sb = document.getElementById('fm-statusbar');
  fmSelected = null;
  if (folders.length === 0) {
    el.innerHTML = \`<div class="empty"><i class="fa-solid fa-folder-open"></i><p>Belum ada folder</p><small><button onclick="openFolderModal()" style="color:#6366F1;background:none;border:none;cursor:pointer;font-size:12px;font-weight:600">Buat folder pertama</button></small></div>\`;
    if (sb) sb.textContent = '0 folder';
    return;
  }
  if (sb) sb.innerHTML = \`<i class="fa-solid fa-circle-info" style="font-size:10px"></i> \${folders.length} folder &nbsp;·&nbsp; Klik dua kali untuk membuka\`;
  el.innerHTML = folders.map(f => {
    const link = \`\${location.origin}/folder/\${encodeURIComponent(f.slug)}\`;
    return \`<div
      id="fm-row-\${f.id}"
      class="fm-row fm-grid-folder"
      onclick="viewFolder(\${f.id})"
      oncontextmenu="fmContextMenu(\${f.id},event)">
      <div class="fm-name">
        <i class="fa-solid fa-folder folder-icon"></i>
        <span title="\${escHtml(f.name)}">\${escHtml(f.name)}</span>
        \${f.password_hash ? '<i class="fa-solid fa-lock" style="color:#F59E0B;font-size:10px;flex-shrink:0"></i>' : ''}
      </div>
      <div class="fm-cell fm-col-md">\${f.file_count||0}</div>
      <div class="fm-cell fm-col-md">
        \${f.is_public
          ? '<span class="badge badge-green"><i class="fa-solid fa-earth-asia" style="font-size:9px"></i> Publik</span>'
          : '<span class="badge badge-slate">Private</span>'}
      </div>
      <div class="fm-cell fm-col-md">
        \${f.password_hash
          ? '<span class="badge badge-amber"><i class="fa-solid fa-key" style="font-size:9px"></i> Ada</span>'
          : '<span style="color:#E2E8F0">—</span>'}
      </div>
      <div class="fm-actions">
        \${f.is_public ? \`<button onclick="event.stopPropagation();copyLink('\${link}')" class="btn-icon" title="Salin link"><i class="fa-solid fa-link" style="font-size:10px"></i></button>\` : ''}
        <button onclick="event.stopPropagation();openFolderModal(\${f.id})" class="btn-icon" title="Edit"><i class="fa-solid fa-pen" style="font-size:10px"></i></button>
        <button onclick="event.stopPropagation();confirmDeleteFolder(\${f.id},'\${escHtml(f.name)}')" class="btn-icon danger" title="Hapus"><i class="fa-solid fa-trash" style="font-size:10px"></i></button>
      </div>
    </div>\`;
  }).join('');
}

function fmSelect(id, e) { /* tidak dipakai — single click langsung viewFolder */ }

function fmContextMenu(id, e) {
  e.preventDefault();
  fmSelect(id, e);
  const old = document.getElementById('fm-ctx');
  if (old) old.remove();
  const f = folders.find(x => x.id == id);
  if (!f) return;
  const link = \`\${location.origin}/folder/\${encodeURIComponent(f.slug)}\`;
  const menu = document.createElement('div');
  menu.id = 'fm-ctx';
  menu.className = 'ctx-menu';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
  menu.innerHTML = \`
    <div class="ctx-label">\${escHtml(f.name)}</div>
    <button class="ctx-item" onclick="viewFolder(\${f.id});fmCloseCtx()"><i class="fa-solid fa-folder-open"></i> Buka Folder</button>
    <button class="ctx-item" onclick="openFolderModal(\${f.id});fmCloseCtx()"><i class="fa-solid fa-pen"></i> Edit</button>
    <button class="ctx-item" onclick="openUploadModal(\${f.id});fmCloseCtx()"><i class="fa-solid fa-upload"></i> Upload ke Sini</button>
    \${f.is_public ? \`
    <div class="ctx-sep"></div>
    <button class="ctx-item" onclick="copyLink('\${link}');fmCloseCtx()"><i class="fa-solid fa-link"></i> Salin Link Publik</button>
    <a href="\${link}" target="_blank" class="ctx-item" onclick="fmCloseCtx()"><i class="fa-solid fa-arrow-up-right-from-square"></i> Buka di Tab Baru</a>
    \` : ''}
    <div class="ctx-sep"></div>
    <button class="ctx-item danger" onclick="confirmDeleteFolder(\${f.id},'\${escHtml(f.name)}');fmCloseCtx()"><i class="fa-solid fa-trash"></i> Hapus</button>
  \`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', fmCloseCtx, {once:true}), 10);
}
function fmCloseCtx() { const m = document.getElementById('fm-ctx'); if (m) m.remove(); }

function copyLink(link) {
  navigator.clipboard.writeText(link).then(() => showToast('Link berhasil disalin'));
}

// ── Folder Modal ───────────────────────────────────────────────────────────
function openFolderModal(id) {
  editingFolderId = id || null;
  const title = document.getElementById('folder-modal-title');
  const nameEl = document.getElementById('folder-name');
  const passEl = document.getElementById('folder-password');
  const removePassRow = document.getElementById('remove-pass-row');
  const removePassCheck = document.getElementById('remove-password');
  const pubToggle = document.getElementById('folder-public-toggle');
  const pubInput = document.getElementById('folder-public');
  const passSection = document.getElementById('password-section');
  const modalMsg = document.getElementById('modal-msg');

  title.textContent = id ? 'Edit Folder' : 'Folder Baru';
  nameEl.value = '';
  passEl.value = '';
  passEl.placeholder = 'Biarkan kosong = tanpa password';
  removePassRow.style.display = 'none';
  if (removePassCheck) removePassCheck.checked = false;
  pubToggle.className = 'toggle';
  pubInput.value = '0';
  passSection.style.display = 'none';
  modalMsg.style.display = 'none';

  if (id) {
    const f = folders.find(x => x.id == id);
    if (f) {
      nameEl.value = f.name;
      const isPublic = !!f.is_public;
      pubToggle.className = 'toggle' + (isPublic ? ' on' : '');
      pubInput.value = isPublic ? '1' : '0';
      if (isPublic) passSection.style.display = 'block';
      if (f.password_hash) {
        passEl.placeholder = 'Isi untuk ganti password, kosongkan jika tidak ubah';
        removePassRow.style.display = 'flex';
      }
    }
  }
  document.getElementById('folder-modal').classList.remove('hidden');
  nameEl.focus();
}

function closeFolderModal() {
  document.getElementById('folder-modal').classList.add('hidden');
}

function toggleFolderPublic(btn) {
  const isOn = btn.classList.contains('on');
  btn.className = 'toggle' + (isOn ? '' : ' on');
  document.getElementById('folder-public').value = isOn ? '0' : '1';
  document.getElementById('password-section').style.display = isOn ? 'none' : 'block';
}

function showModalMsg(text, type) {
  const el = document.getElementById('modal-msg');
  el.className = 'alert ' + (type === 'error' ? 'alert-err' : 'alert-ok');
  el.innerHTML = \`<i class="fa-solid fa-\${type==='error'?'circle-exclamation':'circle-check'}"></i> \${escHtml(text)}\`;
  el.style.display = 'flex';
}

async function saveFolder() {
  const name = document.getElementById('folder-name').value.trim();
  const is_public = document.getElementById('folder-public').value === '1';
  const password = document.getElementById('folder-password').value;
  const remove_password = document.getElementById('remove-password')?.checked || false;
  if (!name) { showModalMsg('Nama folder wajib diisi', 'error'); return; }
  const body = { name, is_public, password: password || null, remove_password };
  let res;
  if (editingFolderId) {
    res = await api(\`/api/folders/\${editingFolderId}\`, { method: 'PUT', body: JSON.stringify(body) });
  } else {
    res = await api('/api/folders', { method: 'POST', body: JSON.stringify(body) });
  }
  if (res.ok) { closeFolderModal(); loadFolders(); showToast(editingFolderId ? 'Folder diperbarui' : 'Folder dibuat'); }
  else showModalMsg(res.data.error || 'Gagal menyimpan', 'error');
}

// ── Delete modal ───────────────────────────────────────────────────────────
let _deleteCallback = null;
function showDeleteModal(text, cb) {
  document.getElementById('delete-confirm-text').textContent = text;
  document.getElementById('delete-confirm-btn').onclick = () => { closeDeleteModal(); cb(); };
  document.getElementById('delete-modal').classList.remove('hidden');
}
function closeDeleteModal() { document.getElementById('delete-modal').classList.add('hidden'); }

function confirmDeleteFolder(id, name) {
  showDeleteModal(\`Hapus folder "\${name}" beserta semua isinya?\`, () => deleteFolder(id, name));
}

async function deleteFolder(id, name) {
  const { ok, data } = await api(\`/api/folders/\${id}\`, { method: 'DELETE' });
  if (ok) { loadFolders(); showToast('Folder dihapus'); }
  else showToast(data.error || 'Gagal menghapus', 'error');
}

// ── View folder files ──────────────────────────────────────────────────────
async function viewFolder(id) {
  id = parseInt(id, 10);
  const folder = folders.find(f => parseInt(f.id,10) === id);
  if (!folder) return;
  currentFolderId = id;
  document.getElementById('files-folder-name').textContent = folder.name;
  const badges = document.getElementById('files-folder-badges');
  badges.innerHTML = (folder.is_public
    ? '<span class="badge badge-green" style="font-size:10px">Publik</span>'
    : '<span class="badge badge-slate" style="font-size:10px">Private</span>')
    + (folder.password_hash ? '<span class="badge badge-amber" style="font-size:10px"><i class="fa-solid fa-lock" style="font-size:8px"></i></span>' : '');
  showPage('files');
  await loadFolderFiles(id);
}

async function viewPublicFiles() {
  currentFolderId = null;
  document.getElementById('files-folder-name').textContent = 'File Publik';
  const badges = document.getElementById('files-folder-badges');
  badges.innerHTML = '<span class="badge badge-indigo" style="font-size:10px"><i class="fa-solid fa-globe" style="font-size:8px"></i> /public/</span>';
  showPage('files');
  await loadFolderFiles(null);
}

async function loadFolderFiles(id) {
  const el = document.getElementById('files-list');
  const sb = document.getElementById('files-statusbar');
  el.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat...</p></div>';
  let files = [];
  if (id === null) {
    const { data } = await api('/api/files/public');
    files = data.files || [];
  } else {
    const { data } = await api(\`/api/folders/\${id}\`);
    files = data.files || [];
  }
  const total = files.reduce((a, f) => a + (f.size||0), 0);
  if (sb) sb.innerHTML = \`<i class="fa-solid fa-circle-info" style="font-size:10px"></i> \${files.length} file\${files.length > 0 ? ' &nbsp;·&nbsp; ' + fmtBytes(total) + ' total' : ''}\`;
  if (files.length === 0) {
    el.innerHTML = '<div class="empty"><i class="fa-solid fa-file-circle-plus"></i><p>Folder ini kosong</p><small>Upload file menggunakan tombol di atas</small></div>';
    return;
  }
  el.innerHTML = files.map(f => {
    const ext = (f.original_name || '').split('.').pop().toLowerCase();
    const iconCls = getFileIcon(ext);
    const dateStr = f.created_at ? new Date(f.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    return \`<div class="fm-row fm-grid-file">
      <div class="fm-name">
        <i class="\${iconCls}" style="font-size:13px;flex-shrink:0"></i>
        <span title="\${escHtml(f.original_name)}">\${escHtml(f.original_name)}</span>
      </div>
      <div class="fm-cell fm-col-md">\${fmtBytes(f.size)}</div>
      <div class="fm-cell fm-col-md">\${dateStr}</div>
      <div class="fm-actions">
        \${id === null ? \`<a href="/public/\${encodeURIComponent(f.original_name)}" target="_blank" class="btn-icon" title="Buka link"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px"></i></a>\` : ''}
        <button onclick="showDeleteModal('Hapus file &quot;\${escHtml(f.original_name)}&quot;?',()=>deleteFile(\${f.id},'\${escHtml(f.original_name)}',\${JSON.stringify(id)}))" class="btn-icon danger" title="Hapus"><i class="fa-solid fa-trash" style="font-size:10px"></i></button>
      </div>
    </div>\`;
  }).join('');
}

function getFileIcon(ext) {
  const map = {
    pdf:'fa-solid fa-file-pdf' ,doc:'fa-solid fa-file-word',docx:'fa-solid fa-file-word',
    xls:'fa-solid fa-file-excel',xlsx:'fa-solid fa-file-excel',
    ppt:'fa-solid fa-file-powerpoint',pptx:'fa-solid fa-file-powerpoint',
    zip:'fa-solid fa-file-zipper',rar:'fa-solid fa-file-zipper','7z':'fa-solid fa-file-zipper',
    jpg:'fa-solid fa-file-image',jpeg:'fa-solid fa-file-image',png:'fa-solid fa-file-image',
    gif:'fa-solid fa-file-image',webp:'fa-solid fa-file-image',svg:'fa-solid fa-file-image',
    mp4:'fa-solid fa-file-video',mkv:'fa-solid fa-file-video',avi:'fa-solid fa-file-video',
    mp3:'fa-solid fa-file-audio',wav:'fa-solid fa-file-audio',
    js:'fa-solid fa-file-code',ts:'fa-solid fa-file-code',py:'fa-solid fa-file-code',
    html:'fa-solid fa-file-code',css:'fa-solid fa-file-code',json:'fa-solid fa-file-code',
    txt:'fa-solid fa-file-lines',md:'fa-solid fa-file-lines',
    exe:'fa-solid fa-gear',dmg:'fa-solid fa-gear',apk:'fa-solid fa-gear',
    iso:'fa-solid fa-compact-disc',
  };
  return (map[ext] || 'fa-solid fa-file') + ' file-icon-' + (
    ['pdf'].includes(ext)?'red':['doc','docx'].includes(ext)?'blue':
    ['xls','xlsx'].includes(ext)?'green':['jpg','jpeg','png','gif','webp','svg'].includes(ext)?'pink':
    ['mp4','mkv','avi'].includes(ext)?'purple':['zip','rar','7z'].includes(ext)?'amber':
    ['mp3','wav'].includes(ext)?'cyan':'slate'
  );
}

async function deleteFile(fileId, name, folderId) {
  const { ok, data } = await api(\`/api/files/\${fileId}\`, { method: 'DELETE' });
  if (ok) {
    await loadFolderFiles(folderId);
    if (folderId !== null) loadFolders();
    showToast('File dihapus');
  } else showToast(data.error || 'Gagal menghapus', 'error');
}

// ── Upload Modal ───────────────────────────────────────────────────────────
function openUploadModal(folderId) {
  modalUploadFolderId = folderId !== null && folderId !== undefined ? parseInt(folderId,10) : null;
  modalUploadFiles = [];
  renderModalQueue();
  const dest = document.getElementById('upload-modal-dest');
  if (modalUploadFolderId !== null) {
    const f = folders.find(x => parseInt(x.id,10) === modalUploadFolderId);
    dest.textContent = 'Tujuan: folder ' + (f ? f.name : '#'+modalUploadFolderId);
  } else {
    dest.textContent = 'Tujuan: file publik — akses via /public/namafile';
  }
  document.getElementById('upload-modal').classList.remove('hidden');
}
function closeUploadModal() {
  document.getElementById('upload-modal').classList.add('hidden');
  modalUploadFiles = [];
  renderModalQueue();
}
function addModalFiles(fileList) {
  modalUploadFiles = [...modalUploadFiles, ...Array.from(fileList)];
  renderModalQueue();
}
function removeModalFile(idx) {
  modalUploadFiles.splice(idx, 1);
  renderModalQueue();
}
function renderModalQueue() {
  const el = document.getElementById('modal-upload-queue');
  const btn = document.getElementById('modal-upload-btn');
  if (btn) btn.className = 'btn btn-success' + (modalUploadFiles.length ? '' : ' hidden');
  if (!el) return;
  el.innerHTML = modalUploadFiles.map((f,i) => \`
    <div class="queue-item" id="mfile-\${i}">
      <div class="queue-item-row">
        <i class="fa-solid fa-file" style="color:#94A3B8;font-size:12px;flex-shrink:0"></i>
        <span class="queue-item-name">\${escHtml(f.name)}</span>
        <span class="queue-item-size">\${fmtBytes(f.size)}\${f.size>95*1024*1024?' · multipart':''}</span>
        <button onclick="removeModalFile(\${i})" style="background:none;border:none;color:#CBD5E1;cursor:pointer;padding:0;flex-shrink:0"><i class="fa-solid fa-xmark" style="font-size:11px"></i></button>
      </div>
      <div id="mfile-prog-\${i}" style="display:none;margin-top:6px">
        <div class="progress-wrap"><div class="progress-bar" id="mfile-bar-\${i}" style="width:0%"></div></div>
        <div id="mfile-status-\${i}" style="font-size:11px;color:#94A3B8;margin-top:3px"></div>
      </div>
    </div>\`).join('');
}

async function startModalUpload() {
  if (!modalUploadFiles.length) return;
  const btn = document.getElementById('modal-upload-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengupload...';
  for (let i = 0; i < modalUploadFiles.length; i++) {
    const file = modalUploadFiles[i];
    document.getElementById('mfile-prog-'+i)?.style && (document.getElementById('mfile-prog-'+i).style.display='block');
    if (file.size > 95*1024*1024) await uploadOneMultipart(file, modalUploadFolderId, i, true);
    else await uploadOneSingle(file, modalUploadFolderId, i, true);
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-rocket"></i> Mulai Upload';
  modalUploadFiles = [];
  renderModalQueue();
  if (modalUploadFolderId !== null && currentFolderId === modalUploadFolderId) await loadFolderFiles(modalUploadFolderId);
  if (modalUploadFolderId === null && document.getElementById('page-files') && !document.getElementById('page-files').classList.contains('hidden')) await loadFolderFiles(null);
  loadFolders();
  setTimeout(closeUploadModal, 600);
  showToast('Upload selesai');
}

document.addEventListener('DOMContentLoaded', () => {
  const mi = document.getElementById('modal-file-input');
  if (mi) mi.addEventListener('change', e => addModalFiles(e.target.files));
  document.getElementById('upload-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('upload-modal')) closeUploadModal();
  });
  document.getElementById('folder-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('folder-modal')) closeFolderModal();
  });
  document.getElementById('delete-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
  });
  showPage(initialPageFromHash());
});

function initialPageFromHash() {
  const valid = ['dashboard','folders','security','gdrive','gdrive-report'];
  const h = (location.hash || '').replace(/^#/, '');
  return valid.includes(h) ? h : 'dashboard';
}

window.addEventListener('hashchange', () => {
  showPage(initialPageFromHash());
});

// ── Security settings ──────────────────────────────────────────────────────
async function loadSecuritySettings() {
  const { data } = await api('/api/settings');
  if (!data || !data.ok) return;
  const s = data.settings || {};
  setToggle('toggle-rate-limit', s.rate_limit_enabled === '1');
  setToggle('toggle-cli', s.allow_cli_downloader === '1');
  const bm = document.getElementById('set-browser-max');
  const cm = document.getElementById('set-cli-max');
  const lm = document.getElementById('set-login-max');
  const lo = document.getElementById('set-lockout-min');
  if (bm) bm.value = s.rate_limit_browser_max || '120';
  if (cm) cm.value = s.rate_limit_cli_max || '60';
  if (lm) lm.value = s.login_max_attempts || '3';
  if (lo) lo.value = s.login_lockout_minutes || '60';
}
async function saveSecuritySettings() {
  const btn = document.getElementById('save-security-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
  const settings = {
    rate_limit_enabled: document.getElementById('toggle-rate-limit').classList.contains('on') ? '1' : '0',
    allow_cli_downloader: document.getElementById('toggle-cli').classList.contains('on') ? '1' : '0',
    rate_limit_browser_max: document.getElementById('set-browser-max').value,
    rate_limit_cli_max: document.getElementById('set-cli-max').value,
    login_max_attempts: document.getElementById('set-login-max').value,
    login_lockout_minutes: document.getElementById('set-lockout-min').value,
  };
  const { ok, data } = await api('/api/settings', { method: 'POST', body: JSON.stringify({ settings }) });
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Pengaturan';
  if (ok) showToast('Pengaturan disimpan');
  else showToast(data.error || 'Gagal menyimpan', 'error');
}
function toggleSetting(btn) { btn.classList.toggle('on'); }
function setToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.className = 'toggle' + (val ? ' on' : '');
}

// ── Upload core ────────────────────────────────────────────────────────────
function uploadOneSingle(file, folderId, idx, isModal=false) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    const pfx = isModal ? 'mfile' : 'file';
    const bar = document.getElementById(pfx+'-bar-'+idx);
    const statusEl = document.getElementById(pfx+'-status-'+idx) || document.getElementById(pfx+'-pct-'+idx);
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      const pct = Math.round(e.loaded/e.total*100);
      if (bar) bar.style.width = pct+'%';
      if (statusEl) statusEl.textContent = pct+'% — '+fmtBytes(e.loaded)+' / '+fmtBytes(e.total);
    };
    xhr.onload = () => {
      if (bar) bar.style.width = '100%';
      if (bar) bar.style.background = xhr.status < 300 ? '#10B981' : '#EF4444';
      if (statusEl) statusEl.textContent = xhr.status < 300 ? 'Selesai' : 'Gagal: '+(JSON.parse(xhr.responseText||'{}').error||'unknown');
      resolve();
    };
    xhr.onerror = () => { if (statusEl) statusEl.textContent = 'Error jaringan'; resolve(); };
    const fd = new FormData();
    fd.append('file', file);
    if (folderId !== null && folderId !== undefined) fd.append('folder_id', folderId);
    xhr.open('POST', '/api/upload');
    xhr.send(fd);
  });
}

async function mpFetch(url, body) {
  const r = await safeFetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!r) throw new Error('Network error');
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Server error');
  return d;
}

async function uploadOneMultipart(file, folderId, idx, isModal=false) {
  const pfx = isModal ? 'mfile' : 'file';
  const bar = document.getElementById(pfx+'-bar-'+idx);
  const statusEl = document.getElementById(pfx+'-status-'+idx) || document.getElementById(pfx+'-pct-'+idx);
  const totalParts = Math.ceil(file.size / PART_SIZE);
  const mimeType = file.type || 'application/octet-stream';

  let initData;
  try {
    initData = await mpFetch('/api/upload/multipart/init', {
      filename: file.name, folder_id: folderId !== null && folderId !== undefined ? parseInt(folderId) : null,
      mime_type: mimeType, total_size: file.size,
    });
  } catch(e) { if (statusEl) statusEl.textContent = 'Init error: '+e.message; return; }

  const { upload_id, storage_key } = initData;
  const parts = [];
  let uploaded = 0;

  for (let p = 0; p < totalParts; p++) {
    const chunk = file.slice(p * PART_SIZE, (p+1) * PART_SIZE);
    if (statusEl) statusEl.textContent = \`Part \${p+1}/\${totalParts}...\`;
    try {
      const params = new URLSearchParams({ upload_id, storage_key, part_number: p+1 });
      const r = await safeFetch(\`/api/upload/multipart/part?\${params}\`, { method:'PUT', body:chunk });
      if (!r || !r.ok) throw new Error('Part upload gagal');
      const d = await r.json();
      parts.push({ partNumber: p+1, etag: d.etag });
      uploaded += chunk.size;
      const pct = Math.round(uploaded/file.size*100);
      if (bar) bar.style.width = pct+'%';
      if (statusEl) statusEl.textContent = \`\${pct}% — \${fmtBytes(uploaded)} / \${fmtBytes(file.size)}\`;
    } catch(e) {
      if (statusEl) statusEl.textContent = 'Error part '+(p+1)+': '+e.message;
      safeFetch('/api/upload/multipart/abort', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({upload_id,storage_key}) });
      return;
    }
  }

  try {
    await mpFetch('/api/upload/multipart/complete', {
      upload_id, storage_key, parts, filename: file.name,
      folder_id: folderId !== null && folderId !== undefined ? parseInt(folderId) : null,
      mime_type: mimeType, total_size: file.size,
    });
    if (bar) { bar.style.width='100%'; bar.style.background='#10B981'; }
    if (statusEl) statusEl.textContent = 'Selesai';
  } catch(e) { if (statusEl) statusEl.textContent = 'Complete error: '+e.message; }
}

// ── Google Drive ──────────────────────────────────────────────────────────
let gdriveAccounts = [];

function fmtBytes(b) {
  b = parseInt(b)||0;
  if(b<1024) return b+' B';
  if(b<1048576) return (b/1024).toFixed(1)+' KB';
  if(b<1073741824) return (b/1048576).toFixed(1)+' MB';
  if(b<1099511627776) return (b/1073741824).toFixed(2)+' GB';
  return (b/1099511627776).toFixed(2)+' TB';
}

function maskEmail(email) {
  if (!email) return '—';
  const at = email.indexOf('@');
  if (at < 0) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const visible = name.slice(0, Math.min(4, Math.max(1, name.length - 2)));
  return visible + '****' + domain;
}

function toggleGDriveEmail(id) {
  const span = document.getElementById('gd-email-' + id);
  const eye  = document.getElementById('gd-eye-' + id);
  if (!span) return;
  const shown = span.getAttribute('data-shown') === '1';
  const full  = span.getAttribute('data-full') || '';
  if (shown) {
    span.textContent = maskEmail(full);
    span.setAttribute('data-shown', '0');
    if (eye) eye.className = 'fa-solid fa-eye';
  } else {
    span.textContent = full;
    span.setAttribute('data-shown', '1');
    if (eye) eye.className = 'fa-solid fa-eye-slash';
  }
}

function toggleGDriveReportEmail(id) {
  const span = document.getElementById('gdr-email-' + id);
  const eye  = document.getElementById('gdr-eye-' + id);
  if (!span) return;
  const shown = span.getAttribute('data-shown') === '1';
  const full  = span.getAttribute('data-full') || '';
  if (shown) {
    span.textContent = maskEmail(full);
    span.setAttribute('data-shown', '0');
    if (eye) eye.className = 'fa-solid fa-eye';
  } else {
    span.textContent = full;
    span.setAttribute('data-shown', '1');
    if (eye) eye.className = 'fa-solid fa-eye-slash';
  }
}

function gdriveQuotaBar(used, total) {
  if (!total) return '<span style="color:#94A3B8;font-size:12px">—</span>';
  const pct = Math.min(100, Math.round(used/total*100));
  const color = pct > 90 ? '#EF4444' : pct > 75 ? '#F59E0B' : '#10B981';
  return \`<div style="margin-top:6px">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#94A3B8;margin-bottom:4px">
      <span>\${fmtBytes(used)} digunakan</span>
      <span>\${pct}%</span>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar" style="width:\${pct}%;background:\${color}"></div>
    </div>
    <div style="font-size:11px;color:#CBD5E1;margin-top:3px">\${fmtBytes(total-used)} tersisa dari \${fmtBytes(total)}</div>
  </div>\`;
}

async function loadGDriveAccounts() {
  const el = document.getElementById('gdrive-accounts-list');
  el.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat akun...</p></div>';
  const { data } = await api('/api/gdrive/accounts');
  gdriveAccounts = data.accounts || [];
  if (!gdriveAccounts.length) {
    el.innerHTML = \`<div class="empty">
      <i class="fa-brands fa-google-drive" style="font-size:36px;color:#E2E8F0"></i>
      <p>Belum ada akun Google Drive</p>
      <small>Klik "+ Tambah Akun" untuk menambahkan</small>
    </div>\`;
    return;
  }
  el.innerHTML = \`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">\`
    + gdriveAccounts.map(acc => {
      const lastSync = acc.quota_updated
        ? new Date(acc.quota_updated).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
        : 'Belum sync';
      return \`<div class="card" style="padding:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="display:flex;align-items:center;gap:12px;min-width:0">
            <div style="width:40px;height:40px;background:\${acc.is_active?'#EEF2FF':'#F8FAFC'};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fa-brands fa-google-drive" style="color:\${acc.is_active?'#6366F1':'#CBD5E1'};font-size:18px"></i>
            </div>
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${escHtml(acc.label)}</div>
              <div style="font-size:11px;color:#94A3B8;margin-top:1px;display:flex;align-items:center;gap:6px;min-width:0">
                <span id="gd-email-\${acc.id}" data-full="\${escHtml(acc.email||'')}" data-shown="0" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0">\${maskEmail(acc.email)}</span>
                \${acc.email ? \`<button type="button" onclick="toggleGDriveEmail(\${acc.id})" title="Tampilkan/sembunyikan email" style="background:none;border:0;cursor:pointer;color:#94A3B8;padding:0;flex-shrink:0"><i id="gd-eye-\${acc.id}" class="fa-solid fa-eye"></i></button>\` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <span class="\${acc.is_active?'badge badge-green':'badge badge-slate'}" style="font-size:10px">
              \${acc.is_active?'Aktif':'Nonaktif'}
            </span>
          </div>
        </div>
        \${gdriveQuotaBar(acc.quota_used, acc.quota_total)}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid #F1F5F9">
          <span style="font-size:11px;color:#CBD5E1">Sync: \${lastSync}</span>
          <div style="display:flex;gap:6px">
            <button onclick="toggleGDriveAccount(\${acc.id},\${acc.is_active?0:1})"
              class="btn btn-neutral btn-sm" style="font-size:11px">
              \${acc.is_active?'Nonaktifkan':'Aktifkan'}
            </button>
            <button onclick="confirmDeleteGDrive(\${acc.id},'\${escHtml(acc.label)}')"
              class="btn btn-danger btn-sm" style="font-size:11px">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>\`;
    }).join('') + '</div>';
}

async function loadGDriveReport() {
  const el = document.getElementById('gdrive-report-content');
  el.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat report...</p></div>';
  const { data } = await api('/api/gdrive/accounts');
  const accounts = data.accounts || [];
  if (!accounts.length) {
    el.innerHTML = '<div class="empty"><i class="fa-brands fa-google-drive" style="font-size:36px;color:#E2E8F0"></i><p>Belum ada akun</p></div>';
    return;
  }

  const totalStorage = accounts.reduce((a,acc) => a + (acc.quota_total||0), 0);
  const totalUsed    = accounts.reduce((a,acc) => a + (acc.quota_used||0), 0);
  const totalFree    = totalStorage - totalUsed;

  el.innerHTML = \`
    <!-- Summary cards -->
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card" style="--accent:#6366F1">
        <div class="stat-card-label">Total Akun</div>
        <div class="stat-card-value">\${accounts.length}</div>
        <div class="stat-card-sub">\${accounts.filter(a=>a.is_active).length} aktif</div>
        <div class="stat-card-icon"><i class="fa-brands fa-google-drive"></i></div>
      </div>
      <div class="stat-card" style="--accent:#10B981">
        <div class="stat-card-label">Total Storage</div>
        <div class="stat-card-value">\${fmtBytes(totalStorage)}</div>
        <div class="stat-card-sub">gabungan semua akun</div>
        <div class="stat-card-icon"><i class="fa-solid fa-database"></i></div>
      </div>
      <div class="stat-card" style="--accent:#F59E0B">
        <div class="stat-card-label">Terpakai</div>
        <div class="stat-card-value">\${fmtBytes(totalUsed)}</div>
        <div class="stat-card-sub">\${totalStorage?Math.round(totalUsed/totalStorage*100):0}% dari total</div>
        <div class="stat-card-icon"><i class="fa-solid fa-chart-pie"></i></div>
      </div>
      <div class="stat-card" style="--accent:#10B981">
        <div class="stat-card-label">Tersisa</div>
        <div class="stat-card-value">\${fmtBytes(totalFree)}</div>
        <div class="stat-card-sub">ruang tersedia</div>
        <div class="stat-card-icon"><i class="fa-solid fa-circle-check"></i></div>
      </div>
    </div>

    <!-- Per account detail -->
    <div class="card">
      <div class="card-header"><span class="card-title">Detail Per Akun</span></div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:16px">
        \${accounts.map(acc => {
          const pct = acc.quota_total ? Math.min(100, Math.round(acc.quota_used/acc.quota_total*100)) : 0;
          const free = (acc.quota_total||0) - (acc.quota_used||0);
          const color = pct>90?'#EF4444':pct>75?'#F59E0B':'#10B981';
          const status = free < 1024*1024*1024
            ? '<span class="badge badge-red" style="font-size:10px"><i class="fa-solid fa-triangle-exclamation" style="font-size:9px"></i> Hampir Penuh</span>'
            : free < 5*1024*1024*1024
            ? '<span class="badge badge-amber" style="font-size:10px">Perhatian</span>'
            : '<span class="badge badge-green" style="font-size:10px">Aman</span>';
          return \`<div style="padding:14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <i class="fa-brands fa-google-drive" style="color:\${acc.is_active?'#6366F1':'#CBD5E1'};font-size:16px"></i>
                <div>
                  <div style="font-size:13px;font-weight:600;color:#0F172A">\${escHtml(acc.label)}</div>
                  <div style="font-size:11px;color:#94A3B8;display:flex;align-items:center;gap:6px">
                    <span id="gdr-email-\${acc.id}" data-full="\${escHtml(acc.email||'')}" data-shown="0">\${maskEmail(acc.email)}</span>
                    \${acc.email ? \`<button type="button" onclick="toggleGDriveReportEmail(\${acc.id})" title="Tampilkan/sembunyikan email" style="background:none;border:0;cursor:pointer;color:#94A3B8;padding:0"><i id="gdr-eye-\${acc.id}" class="fa-solid fa-eye"></i></button>\` : ''}
                  </div>
                </div>
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                \${status}
                <span class="\${acc.is_active?'badge badge-green':'badge badge-slate'}" style="font-size:10px">\${acc.is_active?'Aktif':'Off'}</span>
              </div>
            </div>
            <div class="progress-wrap">
              <div class="progress-bar" style="width:\${pct}%;background:\${color}"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#94A3B8;margin-top:6px">
              <span>\${fmtBytes(acc.quota_used)} / \${fmtBytes(acc.quota_total)}</span>
              <span>\${fmtBytes(free)} tersisa (\${100-pct}%)</span>
            </div>
          </div>\`;
        }).join('')}
      </div>
    </div>
  \`;
}

function openGDriveModal() {
  document.getElementById('gd-label').value = '';
  document.getElementById('gd-email').value = '';
  document.getElementById('gd-token').value = '';
  document.getElementById('gdrive-modal-msg').style.display = 'none';
  document.getElementById('gdrive-modal').classList.remove('hidden');
  document.getElementById('gd-label').focus();
}
function closeGDriveModal() {
  document.getElementById('gdrive-modal').classList.add('hidden');
}

async function saveGDriveAccount() {
  const label = document.getElementById('gd-label').value.trim();
  const email = document.getElementById('gd-email').value.trim();
  const token = document.getElementById('gd-token').value.trim();
  if (!label) { showGDriveModalMsg('Label akun wajib diisi', 'error'); return; }
  if (!token) { showGDriveModalMsg('Refresh token wajib diisi', 'error'); return; }

  const btn = document.getElementById('gd-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

  const { ok, data } = await api('/api/gdrive/accounts', {
    method: 'POST',
    body: JSON.stringify({ label, email, refresh_token: token }),
  });

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan & Verifikasi';

  if (ok) {
    closeGDriveModal();
    showToast('Akun GDrive berhasil ditambahkan');
    loadGDriveAccounts();
  } else {
    showGDriveModalMsg(data.error || 'Gagal menyimpan', 'error');
  }
}

function showGDriveModalMsg(text, type) {
  const el = document.getElementById('gdrive-modal-msg');
  el.className = 'alert ' + (type==='error' ? 'alert-err' : 'alert-ok');
  el.innerHTML = \`<i class="fa-solid fa-\${type==='error'?'circle-exclamation':'circle-check'}"></i> \${escHtml(text)}\`;
  el.style.display = 'flex';
}

async function toggleGDriveAccount(id, newState) {
  const { ok } = await api(\`/api/gdrive/accounts/\${id}\`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: newState }),
  });
  if (ok) { loadGDriveAccounts(); showToast(newState ? 'Akun diaktifkan' : 'Akun dinonaktifkan'); }
  else showToast('Gagal mengubah status', 'error');
}

function confirmDeleteGDrive(id, label) {
  showDeleteModal(
    \`Hapus akun GDrive "\${label}"? File yang sudah diupload tidak akan terhapus dari Google Drive.\`,
    async () => {
      const { ok } = await api(\`/api/gdrive/accounts/\${id}\`, { method: 'DELETE' });
      if (ok) { loadGDriveAccounts(); showToast('Akun dihapus'); }
      else showToast('Gagal menghapus', 'error');
    }
  );
}

async function syncGDriveQuota() {
  showToast('Sync quota...');
  const { ok, data } = await api('/api/gdrive/sync-quota', { method: 'POST' });
  if (ok) {
    showToast(\`Sync selesai — \${data.results?.filter(r=>r.ok).length || 0} akun berhasil\`);
    loadGDriveAccounts();
  } else showToast(data.error || 'Sync gagal', 'error');
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  const old = document.getElementById('toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'toast';
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:200;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9px;font-size:12px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.12);animation:fadeIn .2s ease;';
  t.style.background = type === 'error' ? '#FFF5F5' : '#F0FDF4';
  t.style.color = type === 'error' ? '#DC2626' : '#16A34A';
  t.style.border = '1px solid ' + (type === 'error' ? '#FECACA' : '#BBF7D0');
  t.innerHTML = \`<i class="fa-solid fa-\${type==='error'?'circle-exclamation':'circle-check'}"></i> \${escHtml(msg)}\`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── File icon colors (inject CSS) ──────────────────────────────────────────
const iconColors = document.createElement('style');
iconColors.textContent = '.file-icon-red{color:#EF4444}.file-icon-blue{color:#3B82F6}.file-icon-green{color:#10B981}.file-icon-pink{color:#EC4899}.file-icon-purple{color:#8B5CF6}.file-icon-amber{color:#F59E0B}.file-icon-cyan{color:#06B6D4}.file-icon-slate{color:#94A3B8}';
document.head.appendChild(iconColors);

</script>
</body></html>`;
}

