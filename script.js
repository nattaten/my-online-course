document.addEventListener('DOMContentLoaded', () => {

    const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';
    const STORAGE_KEY = 'math_student_v1';

    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library ยังไม่โหลด');
        return;
    }

    const { createClient } = window.supabase;
    const _sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    let _allLessons      = [];
    let _filteredLessons = [];
    let _courseNames     = [];
    let _activeCourse    = 'all';
    let _currentLessonId = null;
    let _sidebarOpen     = true;

    // ==============================
    // SESSION RESTORE
    // ==============================
    const _saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } })();
    if (_saved?.email && _saved?.password) {
        doLogin(_saved.email, _saved.password, _saved.currentLessonId || null);
    }

    // ==============================
    // LOGIN
    // ==============================
    const loginBtn = document.getElementById('login-btn');
    const btnText  = document.getElementById('btn-text');
    const btnLoader = document.getElementById('btn-loader');

    loginBtn.addEventListener('click', () => doLogin());

    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const ls = document.getElementById('login-section');
            if (ls && ls.style.display !== 'none') doLogin();
        }
    });

    async function doLogin(savedEmail, savedPassword, restoreLessonId) {
        const emailEl  = document.getElementById('email');
        const passEl   = document.getElementById('password');
        const errorMsg = document.getElementById('error-msg');

        const email    = savedEmail    || (emailEl?.value.trim().toLowerCase());
        const password = savedPassword || (passEl?.value.trim());

        if (errorMsg) errorMsg.innerText = '';

        if (!email || !password) {
            if (errorMsg) errorMsg.innerText = 'กรุณากรอกข้อมูลให้ครบ';
            return;
        }

        setLoading(true);

        try {
            const { data: userRows, error } = await _sb
                .from('users_courses')
                .select('*')
                .eq('email', email)
                .eq('password', password);

            if (error || !userRows || userRows.length === 0) {
                localStorage.removeItem(STORAGE_KEY);
                if (errorMsg) errorMsg.innerText = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
                setLoading(false);
                return;
            }

            _courseNames = [...new Set(userRows.map(r => r.course_name))];

            const { data: lessons, error: lessonError } = await _sb
                .from('lessons')
                .select('*')
                .in('course_name', _courseNames)
                .order('course_name', { ascending: true })
                .order('order_no',    { ascending: true });

            if (lessonError) {
                if (errorMsg) errorMsg.innerText = 'ดึงข้อมูลบทเรียนล้มเหลว: ' + lessonError.message;
                setLoading(false);
                return;
            }

            _allLessons = lessons || [];
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password, currentLessonId: restoreLessonId || null }));
            showCoursePage(_allLessons, _courseNames, restoreLessonId);

        } catch (err) {
            if (errorMsg) errorMsg.innerText = 'ข้อผิดพลาด: ' + err.message;
            setLoading(false);
        }
    }

    function setLoading(on) {
        if (loginBtn)  loginBtn.disabled        = on;
        if (btnText)   btnText.style.display    = on ? 'none'   : 'inline';
        if (btnLoader) btnLoader.style.display  = on ? 'inline' : 'none';
    }

    // ==============================
    // COURSE PAGE
    // ==============================
    function showCoursePage(lessons, courseNames, restoreLessonId) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('video-section').style.display = 'block';

        const hasMulti = courseNames.length > 1;
        document.getElementById('course-title').innerText = hasMulti
            ? `คอร์สของฉัน (${courseNames.length} คอร์ส)`
            : courseNames[0];

        if (hasMulti) renderCourseTabs(courseNames);

        _activeCourse    = 'all';
        _filteredLessons = [...lessons];
        renderPlaylist();

        let startLesson = lessons[0];
        if (restoreLessonId) {
            const found = lessons.find(l => String(l.id) === String(restoreLessonId));
            if (found) startLesson = found;
        }

        if (startLesson) {
            selectLesson(startLesson, false);
        } else {
            document.getElementById('main-display').innerHTML =
                '<div class="no-content">ไม่พบบทเรียน</div>';
        }

        setupKeyboard();
        setupSwipe();
        setupSidebarToggle();

        // hide keyboard hint on mobile
        if (window.innerWidth <= 640) {
            const hint = document.getElementById('keyboard-hint');
            if (hint) hint.style.display = 'none';
        }
    }

    // ==============================
    // COURSE TABS
    // ==============================
    function renderCourseTabs(courseNames) {
        const tabsEl = document.getElementById('course-tabs');
        tabsEl.style.display = 'flex';
        let html = `<button class="course-tab active" data-course="all" onclick="window._selectCourse('all')">ทั้งหมด</button>`;
        courseNames.forEach(name => {
            html += `<button class="course-tab" data-course="${escAttr(name)}" onclick="window._selectCourse('${escAttr(name)}')">${name}</button>`;
        });
        tabsEl.innerHTML = html;
    }

    window._selectCourse = function(course) {
        _activeCourse    = course;
        _filteredLessons = course === 'all'
            ? [..._allLessons]
            : _allLessons.filter(l => l.course_name === course);

        document.querySelectorAll('.course-tab').forEach(el => {
            el.classList.toggle('active', el.dataset.course === course);
        });

        renderPlaylist();

        if (_filteredLessons.length > 0) {
            selectLesson(_filteredLessons[0], false);
        }
    };

    // ==============================
    // RENDER PLAYLIST
    // ==============================
    function renderPlaylist() {
        const container = document.getElementById('playlist');
        const hasMulti  = _courseNames.length > 1 && _activeCourse === 'all';

        if (!_filteredLessons.length) {
            container.innerHTML = '<div class="playlist-empty">ไม่พบบทเรียน</div>';
            updateCounter(0, 0);
            return;
        }

        let html = '';
        let currentCourse = '';
        let currentTopic  = '';

        _filteredLessons.forEach((item, idx) => {
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
            const badge    = hasVideo && hasPdf ? 'both' : hasVideo ? 'video' : 'pdf';
            const badgeLabel = badge === 'both' ? 'วิดีโอ+PDF' : badge === 'video' ? 'วิดีโอ' : 'PDF';
            const isActive = String(item.id) === String(_currentLessonId);

            html += `
                <div class="playlist-item${isActive ? ' active' : ''}" data-idx="${idx}" data-id="${item.id}"
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
        updateCounter(_filteredLessons.length, _filteredLessons.length);
    }

    // ==============================
    // SELECT LESSON
    // ==============================
    function selectLesson(lesson, autoplay) {
        _currentLessonId = lesson.id;

        // save current lesson to localStorage
        const curr = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } })();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...curr, currentLessonId: lesson.id }));

        // highlight playlist
        document.querySelectorAll('.playlist-item').forEach(el => {
            el.classList.toggle('active', String(el.dataset.id) === String(lesson.id));
        });
        const activeItem = document.querySelector('.playlist-item.active');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

        const hasVideo = lesson.vimeo_id && lesson.vimeo_id.trim() !== '';
        const hasPdf   = lesson.pdf_url  && lesson.pdf_url.trim()  !== '' && lesson.pdf_url !== 'null';
        const display  = document.getElementById('main-display');

        if (hasVideo) {
            const src = resolveVideoSrc(lesson.vimeo_id, autoplay);
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
            display.innerHTML = `
                <div class="pdf-only-header">
                    <div class="pdf-only-icon">📄</div>
                    <div>
                        <div class="pdf-only-title">${lesson.lesson_title}</div>
                        ${lesson.topic_name ? `<div class="pdf-only-topic">${lesson.topic_name}</div>` : ''}
                    </div>
                </div>`;
        }

        renderPdfs(lesson.pdf_url || '', hasPdf);
        updateNavButtons();

        // close mobile sidebar after selecting
        if (window.innerWidth <= 640) closeMobileSidebar();
    }

    window._selectByIdx = function(idx) {
        const lesson = _filteredLessons[idx];
        if (!lesson) return;
        selectLesson(lesson, true);
        document.getElementById('main-display')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ==============================
    // PREV / NEXT
    // ==============================
    function getCurrentIdx() {
        return _filteredLessons.findIndex(l => String(l.id) === String(_currentLessonId));
    }

    function updateNavButtons() {
        const idx        = getCurrentIdx();
        const prevBtn    = document.getElementById('prev-btn');
        const nextBtn    = document.getElementById('next-btn');
        const navCounter = document.getElementById('nav-counter');

        if (prevBtn)    prevBtn.disabled    = idx <= 0;
        if (nextBtn)    nextBtn.disabled    = idx >= _filteredLessons.length - 1;
        if (navCounter && _filteredLessons.length > 0) {
            navCounter.textContent = `${idx + 1} / ${_filteredLessons.length}`;
        }
    }

    window.goPrev = function() {
        const idx = getCurrentIdx();
        if (idx > 0) {
            selectLesson(_filteredLessons[idx - 1], true);
            document.getElementById('main-display')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    window.goNext = function() {
        const idx = getCurrentIdx();
        if (idx < _filteredLessons.length - 1) {
            selectLesson(_filteredLessons[idx + 1], true);
            document.getElementById('main-display')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // ==============================
    // KEYBOARD SHORTCUTS
    // ==============================
    function setupKeyboard() {
        document.addEventListener('keydown', e => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                window.goNext();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                window.goPrev();
            }
        });
    }

    // ==============================
    // SWIPE (mobile)
    // ==============================
    let _touchStartX = 0;
    let _touchStartY = 0;

    function setupSwipe() {
        const playerArea = document.querySelector('.player-area');
        if (!playerArea || playerArea._swipeInit) return;
        playerArea._swipeInit = true;

        playerArea.addEventListener('touchstart', e => {
            _touchStartX = e.touches[0].clientX;
            _touchStartY = e.touches[0].clientY;
        }, { passive: true });

        playerArea.addEventListener('touchend', e => {
            const dx = _touchStartX - e.changedTouches[0].clientX;
            const dy = Math.abs(_touchStartY - e.changedTouches[0].clientY);
            if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
                if (dx > 0) window.goNext();
                else        window.goPrev();
            }
        }, { passive: true });
    }

    // ==============================
    // SIDEBAR TOGGLE (desktop)
    // ==============================
    function setupSidebarToggle() {
        const btn = document.getElementById('sidebar-toggle-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const layout = document.getElementById('split-layout');
            _sidebarOpen = !_sidebarOpen;
            layout.classList.toggle('sidebar-hidden', !_sidebarOpen);
            btn.textContent = _sidebarOpen ? '☰' : '▶';
        });
    }

    // ==============================
    // MOBILE SIDEBAR
    // ==============================
    window.toggleMobileSidebar = function() {
        const sidebar   = document.getElementById('sidebar');
        const backdrop  = document.getElementById('sidebar-backdrop');
        const isOpen    = sidebar.classList.contains('mobile-open');
        if (isOpen) {
            closeMobileSidebar();
        } else {
            sidebar.classList.add('mobile-open');
            backdrop.classList.add('active');
        }
    };

    window.closeMobileSidebar = function() {
        document.getElementById('sidebar')?.classList.remove('mobile-open');
        document.getElementById('sidebar-backdrop')?.classList.remove('active');
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
            let label = '';
            let url   = entry;

            if (entry.includes('|')) {
                const parts = entry.split('|');
                label = parts[0].trim();
                url   = parts.slice(1).join('|').trim();
            }
            if (!label) label = extractFilename(url);

            const downloadUrl = getDownloadUrl(url);

            const card = document.createElement('div');
            card.className = 'pdf-card';
            card.innerHTML = `
                <div class="pdf-card-icon">📄</div>
                <div class="pdf-card-info">
                    <span class="pdf-card-name">${label}</span>
                    <span class="pdf-card-sub">เอกสารประกอบการเรียน</span>
                </div>
                <div class="pdf-card-actions">
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="pdf-btn pdf-btn-open">เปิด</a>
                    <a href="${downloadUrl}" download target="_blank" rel="noopener noreferrer" class="pdf-btn pdf-btn-dl" title="ดาวน์โหลด">⬇</a>
                </div>`;
            container.appendChild(card);
        });
    }

    function getDownloadUrl(url) {
        const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (driveMatch) return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
        return url;
    }

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
        const q     = (document.getElementById('playlist-search')?.value || '').toLowerCase().trim();
        const items = document.querySelectorAll('.playlist-item');
        let visible = 0;

        items.forEach(el => {
            const title = (el.dataset.title || '').toLowerCase();
            const topic = (el.dataset.topic || '').toLowerCase();
            const match = !q || title.includes(q) || topic.includes(q);
            el.style.display = match ? '' : 'none';
            if (match) visible++;
        });

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

        updateCounter(visible, _filteredLessons.length);
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
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    });
});
