document.addEventListener('DOMContentLoaded', () => {

    const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';

    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library ยังไม่โหลด');
        return;
    }

    const { createClient } = window.supabase;
    const _sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // เก็บ lessons ทั้งหมดไว้ใช้กับ search
    let _allLessons = [];

    // ==============================
    // LOGIN
    // ==============================
    const loginBtn = document.getElementById('login-btn');
    const btnText   = document.getElementById('btn-text');
    const btnLoader = document.getElementById('btn-loader');

    loginBtn.addEventListener('click', doLogin);

    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const ls = document.getElementById('login-section');
            if (ls && ls.style.display !== 'none') doLogin();
        }
    });

    async function doLogin() {
        const emailEl  = document.getElementById('email');
        const passEl   = document.getElementById('password');
        const errorMsg = document.getElementById('error-msg');
        if (!emailEl || !passEl) return;

        // ✅ แปลง email เป็น lowercase ทั้งหมดก่อน query
        const email    = emailEl.value.trim().toLowerCase();
        const password = passEl.value.trim();
        errorMsg.innerText = '';

        if (!email || !password) {
            errorMsg.innerText = 'กรุณากรอกข้อมูลให้ครบ';
            return;
        }

        setLoading(true);

        try {
            const { data: userRows, error: authError } = await _sb
                .from('users_courses')
                .select('*')
                .eq('email', email)
                .eq('password', password);

            if (authError || !userRows || userRows.length === 0) {
                errorMsg.innerText = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
                setLoading(false);
                return;
            }

            const courseNames = [...new Set(userRows.map(r => r.course_name))];

            const { data: lessons, error: lessonError } = await _sb
                .from('lessons')
                .select('*')
                .in('course_name', courseNames)
                .order('course_name', { ascending: true })
                .order('order_no',    { ascending: true });

            if (lessonError) {
                errorMsg.innerText = 'ดึงข้อมูลบทเรียนล้มเหลว: ' + lessonError.message;
                setLoading(false);
            } else {
                _allLessons = lessons || [];
                showCoursePage(userRows[0], _allLessons, courseNames);
            }
        } catch (err) {
            errorMsg.innerText = 'ข้อผิดพลาด: ' + err.message;
            setLoading(false);
        }
    }

    function setLoading(on) {
        loginBtn.disabled       = on;
        btnText.style.display   = on ? 'none'   : 'inline';
        btnLoader.style.display = on ? 'inline' : 'none';
    }

    // ==============================
    // COURSE PAGE
    // ==============================
    function showCoursePage(userData, lessons, courseNames) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('video-section').style.display = 'block';

        const hasMulti = courseNames.length > 1;
        document.getElementById('course-title').innerText = hasMulti
            ? 'คอร์สของฉัน (' + courseNames.length + ' คอร์ส)'
            : courseNames[0];

        renderPlaylist(lessons, courseNames);

        if (lessons.length > 0) {
            selectLesson(lessons[0]);
        } else {
            document.getElementById('main-display').innerHTML =
                '<div class="no-content">ไม่พบบทเรียน</div>';
        }
    }

    // ==============================
    // RENDER PLAYLIST
    // ==============================
    function renderPlaylist(lessons, courseNames) {
        const container = document.getElementById('playlist');
        const hasMulti  = courseNames && courseNames.length > 1;

        if (!lessons.length) {
            container.innerHTML = '<div class="playlist-empty">ไม่พบบทเรียน</div>';
            return;
        }

        let html = '';
        let currentCourse = '';
        let currentTopic  = '';

        lessons.forEach((item, idx) => {
            if (hasMulti && item.course_name !== currentCourse) {
                currentCourse = item.course_name;
                currentTopic  = '';
                html += `<div class="playlist-course-header">🎓 ${currentCourse}</div>`;
            }
            if (item.topic_name && item.topic_name !== currentTopic) {
                currentTopic = item.topic_name;
                html += `<div class="playlist-topic">${currentTopic}</div>`;
            }

            const hasVideo = item.vimeo_id && item.vimeo_id.trim() !== '';
            const hasPdf   = item.pdf_url  && item.pdf_url.trim()  !== '' && item.pdf_url !== 'null';
            const badge    = hasVideo && hasPdf ? 'both'
                           : hasVideo           ? 'video'
                           :                      'pdf';
            const badgeLabel = badge === 'both' ? 'วิดีโอ+PDF'
                             : badge === 'video' ? 'วิดีโอ'
                             :                     'PDF';

            html += `
                <div class="playlist-item" data-idx="${idx}"
                    data-title="${escAttr(item.lesson_title)}"
                    data-topic="${escAttr(item.topic_name || '')}"
                    onclick="window._selectByIdx(${idx})">
                    <div class="playlist-item-inner">
                        <span class="playlist-num">${idx + 1}</span>
                        <span class="playlist-item-title">${item.lesson_title}</span>
                        <span class="playlist-badge badge-${badge}">${badgeLabel}</span>
                    </div>
                </div>`;
        });

        container.innerHTML = html;
        updateCounter(lessons.length, lessons.length);
    }

    // ==============================
    // SELECT LESSON
    // ==============================
    function selectLesson(lesson) {
        // highlight ใน playlist
        document.querySelectorAll('.playlist-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.idx) === _allLessons.indexOf(lesson));
        });

        const hasVideo = lesson.vimeo_id && lesson.vimeo_id.trim() !== '';
        const hasPdf   = lesson.pdf_url  && lesson.pdf_url.trim()  !== '' && lesson.pdf_url !== 'null';

        const display = document.getElementById('main-display');

        if (hasVideo) {
            // แสดง video player
            const src = resolveVideoSrc(lesson.vimeo_id, false);
            display.innerHTML = `
                <div class="video-container">
                    <iframe id="main-player" src="${src}"
                        frameborder="0"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowfullscreen></iframe>
                </div>
                <div class="lesson-info-bar">
                    <span class="lesson-info-title">${lesson.lesson_title}</span>
                    ${lesson.topic_name ? `<span class="lesson-info-topic">${lesson.topic_name}</span>` : ''}
                </div>`;
        } else {
            // PDF อย่างเดียว — แสดง card แทน
            display.innerHTML = `
                <div class="pdf-only-header">
                    <div class="pdf-only-icon">📄</div>
                    <div>
                        <div class="pdf-only-title">${lesson.lesson_title}</div>
                        ${lesson.topic_name ? `<div class="pdf-only-topic">${lesson.topic_name}</div>` : ''}
                    </div>
                </div>`;
        }

        // render PDF buttons
        renderPdfs(lesson.pdf_url || '', hasPdf);
    }

    // global เพื่อให้ onclick ใน HTML เรียกได้
    window._selectByIdx = function(idx) {
        const lesson = _allLessons[idx];
        if (!lesson) return;
        selectLesson(lesson);
        // autoplay เมื่อเปลี่ยนคลิป
        if (lesson.vimeo_id && lesson.vimeo_id.trim() !== '') {
            setTimeout(() => {
                const iframe = document.getElementById('main-player');
                if (iframe) iframe.src = resolveVideoSrc(lesson.vimeo_id, true);
            }, 50);
        }
        // บนมือถือ scroll ขึ้นไปดู player
        document.getElementById('main-display')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ==============================
    // RENDER PDFs
    // ==============================
    function renderPdfs(rawUrl, hasPdf) {
        const container = document.getElementById('pdf-container');
        container.innerHTML = '';
        if (!hasPdf) return;

        const entries = rawUrl.split(',').map(s => s.trim()).filter(s => s.startsWith('http'));
        if (!entries.length) return;

        entries.forEach(entry => {
            // format: "ชื่อ|https://..." หรือ "https://..." อย่างเดียว
            let label = '';
            let url   = entry;

            if (entry.includes('|')) {
                const parts = entry.split('|');
                label = parts[0].trim();
                url   = parts.slice(1).join('|').trim();
            }

            // ถ้าไม่มีชื่อ → ดึงจาก URL
            if (!label) label = extractFilename(url);

            const card = document.createElement('a');
            card.href        = url;
            card.target      = '_blank';
            card.rel         = 'noopener noreferrer';
            card.className   = 'pdf-card';
            card.innerHTML   = `
                <div class="pdf-card-icon">📄</div>
                <div class="pdf-card-info">
                    <span class="pdf-card-name">${label}</span>
                    <span class="pdf-card-sub">เปิดเอกสาร</span>
                </div>
                <div class="pdf-card-arrow">→</div>`;
            container.appendChild(card);
        });
    }

    // ดึงชื่อไฟล์จาก URL
    function extractFilename(url) {
        try {
            const pathname = new URL(url).pathname;
            const name = decodeURIComponent(pathname.split('/').pop());
            return name || 'เอกสารประกอบการเรียน';
        } catch {
            return 'เอกสารประกอบการเรียน';
        }
    }

    // ==============================
    // PLAYLIST SEARCH
    // ==============================
    window.filterPlaylist = function() {
        const q = (document.getElementById('playlist-search')?.value || '').toLowerCase().trim();
        const items = document.querySelectorAll('.playlist-item');
        let visible = 0;

        items.forEach(el => {
            const title = (el.dataset.title || '').toLowerCase();
            const topic = (el.dataset.topic || '').toLowerCase();
            const match = !q || title.includes(q) || topic.includes(q);
            el.style.display = match ? '' : 'none';
            if (match) visible++;
        });

        // ซ่อน topic header ถ้า item ใน group นั้นหายหมด
        document.querySelectorAll('.playlist-topic, .playlist-course-header').forEach(header => {
            let next = header.nextElementSibling;
            let hasVisible = false;
            while (next && !next.classList.contains('playlist-topic') && !next.classList.contains('playlist-course-header')) {
                if (next.classList.contains('playlist-item') && next.style.display !== 'none') {
                    hasVisible = true;
                    break;
                }
                next = next.nextElementSibling;
            }
            header.style.display = hasVisible ? '' : 'none';
        });

        updateCounter(visible, _allLessons.length);
    };

    function updateCounter(visible, total) {
        const el = document.getElementById('lesson-counter');
        if (el) el.textContent = visible === total
            ? `${total} บทเรียน`
            : `${visible} / ${total} บทเรียน`;
    }

    // ==============================
    // HELPERS
    // ==============================
    function resolveVideoSrc(id, autoplay) {
        if (!id) return '';
        const ap = autoplay ? '?autoplay=1' : '';
        if (isNaN(id) && id.length === 11) {
            return `https://www.youtube.com/embed/${id}${autoplay ? '?autoplay=1' : ''}`;
        }
        return `https://player.vimeo.com/video/${id}${ap}`;
    }

    function escAttr(str) {
        return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ==============================
    // LOGOUT
    // ==============================
    document.getElementById('logout-btn').addEventListener('click', () => location.reload());

}); // end DOMContentLoaded