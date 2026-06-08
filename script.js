document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL     = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';
    const STORAGE_KEY = 'studentProfile';

    if (typeof window.supabase === 'undefined') {
        showError('โหลด Supabase ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่');
        return;
    }

    // ถ้ามี session อยู่แล้ว ข้ามไปหน้า dashboard ทันที
    const savedStudent = readStudent();
    if (savedStudent?.id) {
        window.location.href = 'dashboard.html';
        return;
    }

    // --- Tab switching ---
    const tabLogin  = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');

    tabLogin.addEventListener('click',  () => switchTab('login'));
    tabSignup.addEventListener('click', () => switchTab('signup'));

    function switchTab(tab) {
        const isLogin = tab === 'login';
        document.getElementById('form-login').style.display  = isLogin ? 'block' : 'none';
        document.getElementById('form-signup').style.display = isLogin ? 'none'  : 'block';
        tabLogin.classList.toggle('active',  isLogin);
        tabSignup.classList.toggle('active', !isLogin);
        tabLogin.setAttribute('aria-selected',  isLogin ? 'true' : 'false');
        tabSignup.setAttribute('aria-selected', isLogin ? 'false' : 'true');
        clearMessages();
    }

    // ============================================================
    // LOGIN
    // ============================================================
    const loginForm   = document.getElementById('login-form');
    const phoneInput  = document.getElementById('phone');
    const loginButton = document.getElementById('login-btn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();

        const phone = normalizePhone(phoneInput.value);
        if (!phone) { showError('กรุณากรอกเบอร์โทรศัพท์'); return; }
        if (!/^[0-9]{9,10}$/.test(phone)) { showError('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง'); return; }

        setLoading('login', true);

        try {
            // สร้าง Supabase client พร้อมแนบ x-student-phone header
            const sb = createSupabaseWithPhone(phone);

            const { data: student, error } = await sb
                .from('users')
                .select('id, name, email, phone, level')
                .eq('phone', phone)
                .maybeSingle();

            if (error) throw error;

            if (!student) {
                showError('ไม่พบข้อมูลนักเรียนจากเบอร์โทรนี้ หากยังไม่ได้สมัครสมาชิก กรุณากดที่แท็บ "สมัครสมาชิก"');
                return;
            }

            saveStudent(student);
            window.location.href = 'dashboard.html';

        } catch (err) {
            showError('เข้าสู่ระบบไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง'));
        } finally {
            setLoading('login', false);
        }
    });

    // ============================================================
    // SIGN UP
    // ============================================================
    const signupForm = document.getElementById('signup-form');

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();

        const name  = document.getElementById('signup-name').value.trim();
        const level = document.getElementById('signup-level').value;
        const email = document.getElementById('signup-email').value.trim() || null;
        const phone = normalizePhone(document.getElementById('signup-phone').value);

        if (!name)  { showError('กรุณากรอกชื่อ-นามสกุล'); return; }
        if (!level) { showError('กรุณาเลือกระดับชั้น');    return; }
        if (!phone) { showError('กรุณากรอกเบอร์โทรศัพท์'); return; }
        if (!/^[0-9]{9,10}$/.test(phone)) { showError('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง'); return; }

        setLoading('signup', true);

        try {
            // ใช้ phone ว่างสำหรับขั้นตอน signup (ยังไม่มีตัวตนในระบบ)
            const sb = createSupabaseWithPhone('');

            // ตรวจสอบเบอร์ซ้ำก่อน
            const { data: existing } = await sb
                .from('users')
                .select('id')
                .eq('phone', phone)
                .maybeSingle();

            if (existing) {
                showError('เบอร์โทรศัพท์นี้มีในระบบแล้ว กรุณากดแท็บ "เข้าสู่ระบบ" เพื่อเข้าใช้งาน');
                return;
            }

            // INSERT ผู้ใช้ใหม่
            const { data: newUser, error } = await sb
                .from('users')
                .insert({ name, email, phone, level })
                .select('id, name, email, phone, level')
                .single();

            if (error) throw error;

            showSuccess('🎉 สมัครสมาชิกสำเร็จ! กำลังพาเข้าสู่ระบบ...');
            saveStudent(newUser);

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1200);

        } catch (err) {
            showError('สมัครสมาชิกไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง'));
        } finally {
            setLoading('signup', false);
        }
    });

    // ============================================================
    // Helpers
    // ============================================================

    /**
     * สร้าง Supabase client พร้อมแนบ x-student-phone header ทุกครั้ง
     * เพื่อรองรับระบบความปลอดภัย RLS หลังบ้าน
     */
    function createSupabaseWithPhone(phone) {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
                headers: { 'x-student-phone': phone || '' }
            }
        });
    }

    function normalizePhone(value) {
        return String(value || '').trim().replace(/[\s().\-+]/g, '');
    }

    function saveStudent(student) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            id:    student.id,
            name:  student.name,
            email: student.email || '',
            phone: student.phone,
            level: student.level || '',
        }));
    }

    function readStudent() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
        catch { localStorage.removeItem(STORAGE_KEY); return null; }
    }

    function setLoading(form, isLoading) {
        if (form === 'login') {
            loginButton.disabled = isLoading;
            document.getElementById('btn-text').style.display   = isLoading ? 'none'   : 'inline';
            document.getElementById('btn-loader').style.display = isLoading ? 'inline' : 'none';
        } else {
            document.getElementById('signup-btn').disabled             = isLoading;
            document.getElementById('signup-btn-text').style.display   = isLoading ? 'none'   : 'inline';
            document.getElementById('signup-btn-loader').style.display = isLoading ? 'inline' : 'none';
        }
    }

    function showError(message) {
        const el = document.getElementById('error-msg');
        if (el) el.textContent = message;
    }

    function showSuccess(message) {
        const el = document.getElementById('success-msg');
        if (el) el.textContent = message;
    }

    function clearMessages() {
        showError('');
        showSuccess('');
    }
});