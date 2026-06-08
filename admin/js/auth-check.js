// ============================================================
// auth-check.js — Math 10 10 10 Admin
// ตรวจ Supabase Session → ถ้าไม่มี แสดง Login Form ในตัวเลย
// ============================================================

(async function securityGate() {
    document.documentElement.style.visibility = 'hidden';

    // รอ sb และ APP_CONFIG โหลดเสร็จ
    await new Promise(resolve => {
        if (typeof sb !== 'undefined' && typeof APP_CONFIG !== 'undefined') { resolve(); return; }
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });

    const { data: { session } } = await sb.auth.getSession();

    if (session) {
        const isAdmin = APP_CONFIG.adminEmails
            .map(e => e.toLowerCase().trim())
            .includes((session.user?.email || '').toLowerCase().trim());

        if (isAdmin) {
            window._adminSession = session;
            document.documentElement.style.visibility = '';
            return; // ✅ ผ่าน
        }
        await sb.auth.signOut();
    }

    // ❌ ไม่มี session → แสดงหน้า Login แทน dashboard
    document.documentElement.style.visibility = '';
    document.body.innerHTML = `
    <style>
        body { margin:0; background:#0f1117; display:flex; align-items:center;
               justify-content:center; min-height:100vh;
               font-family:'IBM Plex Sans Thai',sans-serif; }
        .lb  { background:#181c27; border:1px solid #2a3045; border-radius:18px;
               padding:48px 40px; width:100%; max-width:380px; text-align:center;
               box-shadow:0 24px 60px rgba(0,0,0,.5); }
        .li  { font-size:48px; margin-bottom:16px; }
        h1   { font-size:22px; font-weight:600; color:#e2e8f0; margin-bottom:4px; }
        .ls  { color:#64748b; font-size:13px; margin-bottom:28px; }
        input { display:block; width:100%; padding:13px 16px; margin-bottom:10px;
                background:#1f2436; border:1px solid #2a3045; border-radius:10px;
                color:#e2e8f0; font-family:inherit; font-size:15px; outline:none;
                box-sizing:border-box; transition:border-color .2s; }
        input:focus { border-color:#3b82f6; }
        .err { color:#ef4444; font-size:13px; min-height:20px; margin-bottom:8px; }
        button { width:100%; padding:14px; background:#3b82f6; color:#fff; border:none;
                 border-radius:10px; font-family:inherit; font-size:16px; font-weight:600;
                 cursor:pointer; transition:background .2s; }
        button:hover:not(:disabled) { background:#2563eb; }
        button:disabled { opacity:.5; cursor:not-allowed; }
    </style>
    <div class="lb">
        <div class="li">⚙️</div>
        <h1>Admin Panel</h1>
        <p class="ls">Math 10 10 10 — เข้าสู่ระบบ</p>
        <input id="a-email" type="email" placeholder="อีเมลแอดมิน" autocomplete="email">
        <input id="a-pass"  type="password" placeholder="รหัสผ่าน" autocomplete="current-password">
        <p class="err" id="a-err"></p>
        <button id="a-btn" onclick="doAdminLogin()">เข้าสู่ระบบ</button>
    </div>`;

    document.getElementById('a-pass').addEventListener('keydown', e => {
        if (e.key === 'Enter') doAdminLogin();
    });

    window.doAdminLogin = async function () {
        const email = document.getElementById('a-email').value.trim();
        const pass  = document.getElementById('a-pass').value;
        const err   = document.getElementById('a-err');
        const btn   = document.getElementById('a-btn');

        if (!email || !pass) { err.textContent = 'กรุณากรอกอีเมลและรหัสผ่าน'; return; }

        btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
        err.textContent = '';

        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

        if (error || !data.session) {
            err.textContent = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
            btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
            return;
        }

        const isAdmin = APP_CONFIG.adminEmails
            .map(e => e.toLowerCase().trim())
            .includes(email.toLowerCase().trim());

        if (!isAdmin) {
            await sb.auth.signOut();
            err.textContent = 'อีเมลนี้ไม่มีสิทธิ์เข้า Admin Panel';
            btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
            return;
        }

        location.reload(); // โหลดใหม่ → session มีแล้ว → ผ่าน
    };
})();