document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';
    const STORAGE_KEY = 'studentProfile';

    if (typeof window.supabase === 'undefined') {
        showError('โหลด Supabase ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        return;
    }

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const loginForm = document.getElementById('login-form');
    const phoneInput = document.getElementById('phone');
    const loginButton = document.getElementById('login-btn');
    const btnText = document.getElementById('btn-text');
    const btnLoader = document.getElementById('btn-loader');

    // ถ้ามี session นักเรียนอยู่แล้ว ให้ข้ามไปหน้า dashboard ได้ทันที
    const savedStudent = readStudent();
    if (savedStudent?.id) {
        window.location.href = 'dashboard.html';
        return;
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        showError('');

        const phone = normalizePhone(phoneInput.value);

        if (!phone) {
            showError('กรุณากรอกเบอร์โทรศัพท์');
            return;
        }

        setLoading(true);

        try {
            // ค้นหานักเรียนจากตาราง users ด้วยเบอร์โทรศัพท์
            const { data: student, error } = await supabaseClient
                .from('users')
                .select('id, name, email, phone, level')
                .eq('phone', phone)
                .maybeSingle();

            if (error) throw error;

            if (!student) {
                localStorage.removeItem(STORAGE_KEY);
                showError('ไม่พบข้อมูลนักเรียนจากเบอร์โทรศัพท์นี้');
                return;
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                id: student.id,
                name: student.name,
                email: student.email,
                phone: student.phone,
                level: student.level
            }));

            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error(error);
            showError('เข้าสู่ระบบไม่สำเร็จ: ' + error.message);
        } finally {
            setLoading(false);
        }
    });

    function normalizePhone(value) {
        // ลบช่องว่าง ขีด วงเล็บ และจุด เพื่อให้เทียบกับข้อมูลในฐานได้ง่ายขึ้น
        return String(value || '').trim().replace(/[\s().-]/g, '');
    }

    function setLoading(isLoading) {
        loginButton.disabled = isLoading;
        btnText.style.display = isLoading ? 'none' : 'inline';
        btnLoader.style.display = isLoading ? 'inline' : 'none';
    }

    function showError(message) {
        const errorMsg = document.getElementById('error-msg');
        if (errorMsg) errorMsg.textContent = message;
    }

    function readStudent() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
    }
});
