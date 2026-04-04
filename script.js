document.addEventListener('DOMContentLoaded', () => {

    const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';

    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library ยังไม่โหลด');
        return;
    }

    const { createClient } = window.supabase;
    const _supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ==============================
    // LOGIN
    // ==============================
    const loginBtn = document.getElementById('login-btn');
    const btnText   = document.getElementById('btn-text');
    const btnLoader = document.getElementById('btn-loader');

    loginBtn.addEventListener('click', async () => {
        const emailEl  = document.getElementById('email');
        const passEl   = document.getElementById('password');
        const errorMsg = document.getElementById('error-msg');
        if (!emailEl || !passEl) return;

        const email    = emailEl.value.trim();
        const password = passEl.value.trim();
        errorMsg.innerText = '';

        if (!email || !password) {
            errorMsg.innerText = 'กรุณากรอกข้อมูลให้ครบ';
            return;
        }

        setLoading(true);

        try {
            // ดึงทุกแถวที่ email + password ตรง (รองรับหลายคอร์ส)
            const { data: userRows, error: authError } = await _supabaseClient
                .from('users_courses')
                .select('*')
                .eq('email', email)
                .eq('password', password);

            if (authError || !userRows || userRows.length === 0) {
                errorMsg.innerText = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
                setLoading(false);
                return;
            }

            // รวบรวมชื่อคอร์สทั้งหมดที่ user นี้มี (ไม่ซ้ำ)
            const courseNames = [...new Set(userRows.map(r => r.course_name))];

            // ดึง lessons จากทุกคอร์สพร้อมกัน
            const { data: lessons, error: lessonError } = await _supabaseClient
                .from('lessons')
                .select('*')
                .in('course_name', courseNames)
                .order('course_name', { ascending: true })
                .order('order_no',    { ascending: true });

            if (lessonError) {
                console.error('Lesson error:', lessonError);
                errorMsg.innerText = 'ดึงข้อมูลบทเรียนล้มเหลว: ' + lessonError.message;
                setLoading(false);
            } else {
                showVideoPage(userRows[0], lessons, courseNames);
            }
        } catch (err) {
            console.error('Unexpected error:', err);
            errorMsg.innerText = 'ข้อผิดพลาด: ' + err.message;
            setLoading(false);
        }
    });

    // กด Enter เพื่อ login
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const loginSection = document.getElementById('login-section');
            if (loginSection.style.display !== 'none') loginBtn.click();
        }
    });

    function setLoading(isLoading) {
        loginBtn.disabled       = isLoading;
        btnText.style.display   = isLoading ? 'none'   : 'inline';
        btnLoader.style.display = isLoading ? 'inline' : 'none';
    }

    // ==============================
    // VIDEO PAGE — รองรับหลายคอร์ส
    // ==============================
    function showVideoPage(userData, lessons, courseNames) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('video-section').style.display = 'block';

        const hasMulti = courseNames.length > 1;

        document.getElementById('course-title').innerText = hasMulti
            ? 'คอร์สของฉัน (' + courseNames.length + ' คอร์ส)'
            : courseNames[0];

        const playerWrapper = document.getElementById('player-wrapper');
        if (!lessons || lessons.length === 0) {
            playerWrapper.innerHTML = '<p style="color:#64748b; text-align:center; padding:40px;">ไม่พบวิดีโอ</p>';
            return;
        }

        // จัดกลุ่มแยกตามคอร์ส แล้วแยก topic
        let playlistHTML  = '';
        let currentCourse = '';
        let currentTopic  = '';

        lessons.forEach((item) => {
            // หัว Section คอร์ส (แสดงเฉพาะตอนมีหลายคอร์ส)
            if (hasMulti && item.course_name !== currentCourse) {
                currentCourse = item.course_name;
                currentTopic  = '';
                playlistHTML += `<div class="course-header">🎓 ${currentCourse}</div>`;
            }
            // หัว Topic
            if (item.topic_name && item.topic_name !== currentTopic) {
                currentTopic = item.topic_name;
                playlistHTML += `<div class="topic-header">📁 ${currentTopic}</div>`;
            }
            playlistHTML += `
                <button class="lesson-btn"
                    onclick="changeVideo('${item.vimeo_id}', '${item.pdf_url || ''}', this)">
                    <span class="play-icon">▶</span>
                    <span class="lesson-title">${item.lesson_title}</span>
                </button>`;
        });

        const first    = lessons[0];
        const firstSrc = resolveVideoSrc(first.vimeo_id, false);

        playerWrapper.innerHTML = `
            <div class="video-container">
                <iframe id="main-player"
                    src="${firstSrc}"
                    frameborder="0"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen></iframe>
            </div>
            <div class="playlist">${playlistHTML}</div>`;

        updatePdfButton(first.pdf_url || '');
    }

    // ==============================
    // เปลี่ยนวิดีโอ
    // ==============================
    window.changeVideo = function(id, pdfUrl, btnElement) {
        const iframe = document.getElementById('main-player');
        if (!iframe) return;
        document.querySelectorAll('.lesson-btn').forEach(btn => btn.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');
        iframe.src = resolveVideoSrc(id, true);
        updatePdfButton(pdfUrl);
        iframe.closest('.video-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ==============================
    // HELPERS
    // ==============================
    function resolveVideoSrc(id, autoplay) {
        const ap = autoplay ? '?autoplay=1' : '';
        if (isNaN(id) && id.length === 11) {
            return `https://www.youtube.com/embed/${id}${autoplay ? '?autoplay=1' : ''}`;
        }
        return `https://player.vimeo.com/video/${id}${ap}`;
    }

    function updatePdfButton(url) {
        const container = document.getElementById('pdf-container');
        if (!container) return;
        container.innerHTML = '';
        if (url && url.trim() !== '' && url !== 'null') {
            const links = url.split(',');
            links.forEach((link, i) => {
                const tLink = link.trim();
                if (tLink.startsWith('http')) {
                    const box = document.createElement('div');
                    box.className = 'pdf-box';
                    box.innerHTML = `
                        <span class="pdf-text">📄 เอกสารประกอบการเรียน ${links.length > 1 ? '(' + (i + 1) + ')' : ''}</span>
                        <a href="${tLink}" target="_blank" rel="noopener noreferrer" class="pdf-link">เปิดไฟล์</a>`;
                    container.appendChild(box);
                }
            });
        }
    }

    // ==============================
    // LOGOUT
    // ==============================
    document.getElementById('logout-btn').addEventListener('click', () => {
        location.reload();
    });

}); // end DOMContentLoaded