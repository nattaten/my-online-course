// ============================================================
// auth-check.js - Math 10 10 10 Admin security gate
// Renders the dashboard only after an approved Supabase session.
// ============================================================

(function () {
    const ADMIN_EMAIL = 'nattaten@gmail.com';

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function getAllowedEmails() {
        const configured = Array.isArray(window.APP_CONFIG?.adminEmails)
            ? window.APP_CONFIG.adminEmails
            : [];
        return new Set([...configured, ADMIN_EMAIL].map(normalizeEmail).filter(Boolean));
    }

    function isAdminSession(session) {
        const email = normalizeEmail(session?.user?.email);
        return Boolean(session && email && getAllowedEmails().has(email));
    }

    function setAuthMessage(message) {
        const el = document.getElementById('admin-login-error');
        if (el) el.textContent = message || '';
    }

    function setLoginLoading(isLoading) {
        const btn = document.getElementById('admin-login-btn');
        if (!btn) return;
        btn.disabled = isLoading;
        btn.textContent = isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ';
    }

    function renderLogin() {
        document.body.classList.remove('admin-auth-pending');
        document.body.classList.add('admin-login-only');

        const appRoot = document.getElementById('app-root');
        const authRoot = document.getElementById('auth-root');
        if (appRoot) appRoot.replaceChildren();
        if (!authRoot) return;

        authRoot.innerHTML = `
            <main class="login-screen" aria-label="Admin login">
                <form class="login-box" id="admin-login-form" autocomplete="on">
                    <div class="login-icon">⚙️</div>
                    <h1>Admin Panel</h1>
                    <p class="login-sub">Math 10 10 10 - เข้าสู่ระบบผู้ดูแล</p>
                    
                    <div id="login-webcam-area" style="display:none; margin-bottom:15px; border-radius:12px; overflow:hidden; border:2px solid var(--border); position:relative; aspect-ratio:4/3; background:#000;">
                        <video id="login-video" style="width:100%; height:100%; object-fit:cover; transform:scaleX(-1);" autoplay muted playsinline></video>
                        <div class="face-scan-overlay" style="position:absolute; inset:0; border:2px solid var(--accent); border-radius:50%; margin:15px 50px; box-shadow:0 0 0 9999px rgba(0,0,0,0.5); pointer-events:none;"></div>
                        <div class="face-scan-laser" style="position:absolute; left:50px; right:50px; height:2px; background:var(--accent); top:15px; animation:laserMove 2s infinite ease-in-out; pointer-events:none; box-shadow:0 0 8px var(--accent);"></div>
                        <span id="login-scan-status" style="position:absolute; bottom:0; left:0; right:0; text-align:center; color:#fff; font-size:12px; font-weight:600; text-shadow:0 1px 4px rgba(0,0,0,0.8); background:rgba(0,0,0,0.45); padding:6px 0;">กำลังเริ่มกล้อง...</span>
                    </div>

                    <input id="admin-login-email" type="email" placeholder="อีเมลแอดมิน" autocomplete="email" required>
                    <input id="admin-login-password" type="password" placeholder="รหัสผ่าน" autocomplete="current-password" required>
                    <p class="login-err" id="admin-login-error" role="alert"></p>
                    <button id="admin-login-btn" type="submit">เข้าสู่ระบบ</button>
                    
                    <button type="button" id="admin-face-login-btn" class="btn-face-login" onclick="window.toggleFaceLogin(this)">📷 สแกนใบหน้าเข้าระบบ</button>
                </form>
            </main>`;

        document.getElementById('admin-login-form')?.addEventListener('submit', handleLogin);
        document.getElementById('admin-login-email')?.focus();
    }

    function renderDashboard(session) {
        if (window.stopFaceLoginScan) window.stopFaceLoginScan();
        const template = document.getElementById('dashboard-template');
        const appRoot = document.getElementById('app-root');
        const authRoot = document.getElementById('auth-root');

        if (!template || !appRoot) {
            renderLogin();
            setAuthMessage('ไม่พบโครงสร้างหน้า Admin กรุณาตรวจสอบ index.html');
            return;
        }

        window._adminSession = session;
        if (authRoot) authRoot.replaceChildren();
        appRoot.replaceChildren(template.content.cloneNode(true));
        document.body.classList.remove('admin-auth-pending', 'admin-login-only');
        document.body.classList.add('admin-authenticated');
        window.dispatchEvent(new CustomEvent('admin:ready', { detail: { session } }));
    }

    async function waitForRuntime() {
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        }

        const startedAt = Date.now();
        while ((!window.sb || !window.APP_CONFIG) && Date.now() - startedAt < 5000) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (!window.sb) throw new Error('Supabase client is not available. Check js/config.js.');
    }

    async function handleLogin(event) {
        event.preventDefault();
        const email = document.getElementById('admin-login-email')?.value.trim() || '';
        const password = document.getElementById('admin-login-password')?.value || '';

        if (!email || !password) {
            setAuthMessage('กรุณากรอกอีเมลและรหัสผ่าน');
            return;
        }

        try {
            setLoginLoading(true);
            setAuthMessage('');
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error || !data?.session) throw error || new Error('Login failed');

            if (!isAdminSession(data.session)) {
                await sb.auth.signOut();
                setAuthMessage('อีเมลนี้ไม่มีสิทธิ์เข้า Admin Panel');
                return;
            }

            renderDashboard(data.session);
        } catch (error) {
            setAuthMessage(error?.message || 'เข้าสู่ระบบไม่สำเร็จ');
        } finally {
            setLoginLoading(false);
        }
    }

    async function securityGate() {
        try {
            await waitForRuntime();
            const { data, error } = await sb.auth.getSession();
            if (error) throw error;

            if (isAdminSession(data?.session)) {
                renderDashboard(data.session);
                return;
            }

            if (data?.session) await sb.auth.signOut();
            renderLogin();
        } catch (error) {
            renderLogin();
            setAuthMessage(error?.message || 'ไม่สามารถตรวจสอบสิทธิ์ได้');
        }
    }

    window.doAdminLogin = handleLogin;
    window.addEventListener('pageshow', securityGate, { once: true });
})();