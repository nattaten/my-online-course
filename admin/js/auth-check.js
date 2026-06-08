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
                    <input id="admin-login-email" type="email" placeholder="อีเมลแอดมิน" autocomplete="email" required>
                    <input id="admin-login-password" type="password" placeholder="รหัสผ่าน" autocomplete="current-password" required>
                    <p class="login-err" id="admin-login-error" role="alert"></p>
                    <button id="admin-login-btn" type="submit">เข้าสู่ระบบ</button>
                </form>
            </main>`;

        document.getElementById('admin-login-form')?.addEventListener('submit', handleLogin);
        document.getElementById('admin-login-email')?.focus();
    }

    function renderDashboard(session) {
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