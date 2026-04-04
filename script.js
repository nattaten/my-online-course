document.addEventListener('DOMContentLoaded', () => {

    // ==============================
    // CONFIG — เปลี่ยน KEY ตรงนี้
    // ไปที่ Supabase Dashboard → Project Settings → API
    // แล้ว copy "anon public" key (ขึ้นต้นด้วย eyJ...)
    // ==============================
    const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts'; // ← แก้ตรงนี้

    // ตรวจสอบว่า Supabase library โหลดมาแล้ว
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library ยังไม่โหลด — ตรวจสอบ CDN script ใน HTML');
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
            errorMsg.innerText = '⚠️ กรุณากรอกข้อมูลให้ครบ';
            return;
        }

        // แสดง loading state
        setLoading(true);

        try {
            // Query ตาราง users_courses
            const { data: user, error: authError } = await _supabaseClient
                .from('users_courses')
                .select('*')
                .eq('email', email)
                .eq('password', password)
                .single();

            if (authError || !user) {
                errorMsg.innerText = '❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง';
                setLoading(false);
                return;
            }

            // ดึง lessons ของ course นั้น
            const { data: lessons, error: lessonError } = await _supabaseClient
                .from('lessons')
                .select('*')
                .eq('course_name', user.course_name)
                .order('order_no', { ascending: true });

            if (lessonError) {
                console.error('Lesson error:', lessonError);
                errorMsg.innerText = '❌ ดึงข้อมูลบทเรียนล้มเหลว: ' + lessonError.message;
                setLoading(false);
            } else {
                showVideoPage(user, lessons);
            }
        } catch (err) {
            console.error('Unexpected error:', err);
            errorMsg.innerText = '❌ ข้อผิดพลาด: ' + err.message;
            setLoading(false);
        }
    });

    // กด Enter เพื่อ login ได้เลย
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const loginSection = document.getElementById('login-section');
            if (loginSection.style.display !== 'none') {
                loginBtn.click();
            }
        }
    });

    function setLoading(isLoading) {
        loginBtn.disabled = isLoading;
        btnText.style.display   = isLoading ? 'none'   : 'inline';
        btnLoader.style.display = isLoading ? 'inline' : 'none';
    }

    // ==============================
    // VIDEO PAGE
    // ==============================
    function showVideoPage(userData, lessons) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('video-section').style.display = 'block';
        document.getElementById('course-title').innerText = '📚 ' + userData.course_name;

        const playerWrapper = document.getElementById('player-wrapper');
        if (!lessons || lessons.length === 0) {
            playerWrapper.innerHTML = '<p style="color:#64748b; text-align:center; padding:40px;">ไม่พบวิดีโอในคอร์สนี้</p>';
            return;
        }

        // สร้าง playlist HTML
        let playlistHTML = '';
        let currentTopic = '';
        lessons.forEach((item) => {
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

        // วิดีโอแรก
        const first   = lessons[0];
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
    // เปลี่ยนวิดีโอ (global เพื่อให้ onclick ใน HTML เรียกได้)
    // ==============================
    window.changeVideo = function(id, pdfUrl, btnElement) {
        const iframe = document.getElementById('main-player');
        if (!iframe) return;

        document.querySelectorAll('.lesson-btn').forEach(btn => btn.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

        iframe.src = resolveVideoSrc(id, true);
        updatePdfButton(pdfUrl);

        // Scroll ขึ้นไปดูวิดีโอบนมือถือ
        iframe.closest('.video-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ==============================
    // HELPERS
    // ==============================
    function resolveVideoSrc(id, autoplay) {
        const ap = autoplay ? '?autoplay=1' : '';
        // YouTube: string ความยาว 11 ตัวอักษรที่ไม่ใช่ตัวเลขล้วน
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