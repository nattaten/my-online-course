document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL      = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';
    const STORAGE_KEY = 'studentProfile';

    if (typeof window.supabase === 'undefined') {
        showMessage('โหลด Supabase ไม่สำเร็จ กรุณารีเฟรชหน้า');
        return;
    }

    const student = readStudent();
    const page    = document.body.dataset.page;

    // ===== สร้าง Supabase client พร้อมแนบ x-student-phone header =====
    // เพื่อรองรับระบบความปลอดภัย RLS ของ Supabase ผ่าน header ลับ
    const studentPhone = student?.phone || '';
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            headers: { 'x-student-phone': studentPhone }
        }
    });

    bindLogout();

    if (!student?.id) {
        window.location.href = 'index.html';
        return;
    }

    if (page === 'dashboard') loadDashboard(student);
    if (page === 'lesson')    initLessonPage(student);

    // ============================================================
    // DASHBOARD
    // ============================================================
    async function loadDashboard(currentStudent) {
        // ตั้งค่า Profile Hero
        const avatar = document.getElementById('profile-avatar');
        const initials = getInitials(currentStudent.name || '?');
        if (avatar) avatar.textContent = initials;

        setText('profile-name',        currentStudent.name  || 'นักเรียน');
        setText('profile-level-text',  currentStudent.level || 'ไม่ระบุระดับชั้น');
        setText('profile-phone-text',  formatPhone(currentStudent.phone || ''));

        showMessage('กำลังโหลดคอร์สเรียน...');

        const { data, error } = await supabaseClient
            .from('enrollments')
            .select(`
                id,
                user_id,
                course_code,
                sort_order,
                courses (
                    course_code,
                    name,
                    subject,
                    schedule_day,
                    schedule_time
                )
            `)
            .eq('user_id', currentStudent.id)
            .order('sort_order', { ascending: true });

        if (error) {
            showMessage('โหลดคอร์สเรียนไม่สำเร็จ: ' + error.message);
            return;
        }

        const enrollments = data || [];
        setText('course-count', String(enrollments.length));
        await renderCourses(enrollments);
        showMessage('');
    }

    async function renderCourses(enrollments) {
        const grid = document.getElementById('course-grid');
        if (!grid) return;

        if (!enrollments.length) {
            grid.innerHTML = `
                <div class="student-empty">
                    <p style="font-size:32px;margin-bottom:12px;">📭</p>
                    <p style="font-weight:600;margin-bottom:4px;">ยังไม่มีคอร์สเรียนในบัญชีนี้</p>
                    <p style="font-size:13px;">กรุณาติดต่อผู้ดูแลระบบเพื่อลงทะเบียนคอร์ส</p>
                </div>`;
            return;
        }

        // ดึงจำนวนบทเรียนของแต่ละคอร์สพร้อมกัน
        const courseCodes = enrollments.map(e => e.course_code || e.courses?.course_code).filter(Boolean);

        let lessonCountMap = {};
        if (courseCodes.length) {
            // ดึง count ทีละคอร์ส (Supabase ไม่รองรับ GROUP BY โดยตรงใน client)
            const countResults = await Promise.allSettled(
                courseCodes.map(code =>
                    supabaseClient
                        .from('lessons')
                        .select('id', { count: 'exact', head: true })
                        .eq('course_code', code)
                        .then(({ count }) => ({ code, count: count || 0 }))
                )
            );

            countResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    lessonCountMap[result.value.code] = result.value.count;
                }
            });
        }

        grid.innerHTML = enrollments.map((enrollment) => {
            const course   = enrollment.courses || {};
            const code     = course.course_code || enrollment.course_code;
            const lessonN  = lessonCountMap[code] ?? '—';
            const schedule = formatSchedule(course);

            return `
                <a class="student-course-card" href="lesson.html?code=${encodeURIComponent(code)}" aria-label="เข้าเรียน ${escHtml(course.name || code)}">
                    <div class="card-accent"></div>
                    <div class="card-body">
                        <h3>${escHtml(course.name || 'ไม่มีชื่อคอร์ส')}</h3>
                        ${course.subject ? `<p class="course-subject">${escHtml(course.subject)}</p>` : ''}
                        ${schedule !== 'ยังไม่ระบุตารางเรียน' ? `<p class="course-schedule">🕐 ${escHtml(schedule)}</p>` : ''}
                        <span class="course-lesson-count">📚 ทั้งหมด ${lessonN} บทเรียน</span>
                    </div>
                    <div class="card-footer">
                        <span class="card-cta">เริ่มเรียนเลย</span>
                        <span class="card-arrow">→</span>
                    </div>
                </a>`;
        }).join('');
    }

    // ============================================================
    // LESSON PAGE
    // ============================================================
    let allLessons   = [];
    let currentIndex = -1;
    let openedSet    = new Set(); // lesson IDs ที่เคย "เปิดแล้ว"

    async function initLessonPage(currentStudent) {
        const courseCode = new URLSearchParams(window.location.search).get('code');

        if (!courseCode) { showMessage('ไม่พบรหัสคอร์ส'); return; }

        showMessage('กำลังโหลดบทเรียน...');

        // ตรวจสิทธิ์
        const { data: enrollment, error: enrollErr } = await supabaseClient
            .from('enrollments')
            .select('id')
            .eq('user_id', currentStudent.id)
            .eq('course_code', courseCode)
            .maybeSingle();

        if (enrollErr) { showMessage('ตรวจสอบสิทธิ์ไม่สำเร็จ: ' + enrollErr.message); return; }
        if (!enrollment) { showMessage('บัญชีนี้ไม่มีสิทธิ์เข้าคอร์สนี้'); return; }

        // โหลดข้อมูลพร้อมกัน (course info + lessons + progress)
        const [courseRes, lessonsRes, progressRes] = await Promise.all([
            supabaseClient
                .from('courses')
                .select('name, subject, schedule_day, schedule_time')
                .eq('course_code', courseCode)
                .maybeSingle(),
            supabaseClient
                .from('lessons')
                .select('id, course_code, lesson_title, topic_name, youtube_url, pdf_url, order_no')
                .eq('course_code', courseCode)
                .order('order_no', { ascending: true }),
            supabaseClient
                .from('lesson_progress')
                .select('lesson_id')
                .eq('user_id', currentStudent.id),
        ]);

        // ตั้งชื่อ sidebar
        if (courseRes.data) {
            const c = courseRes.data;
            setText('sidebar-course-name', c.name || courseCode);
            setText('sidebar-course-sub', [c.subject, formatSchedule(c)].filter(Boolean).join(' · '));
        }

        if (lessonsRes.error) { showMessage('โหลดบทเรียนไม่สำเร็จ: ' + lessonsRes.error.message); return; }

        allLessons = lessonsRes.data || [];
        if (!allLessons.length) { showMessage('ยังไม่มีบทเรียนในคอร์สนี้'); return; }

        // โหลด progress (บทเรียนที่ "เปิดแล้ว")
        if (progressRes.data) {
            progressRes.data.forEach(p => openedSet.add(p.lesson_id));
        }

        buildSidebar(allLessons, courseCode);
        showMessage('');

        // เปิดบทเรียนแรก
        selectLesson(0, courseCode);

        // Sidebar toggle (mobile)
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const sidebar   = document.getElementById('lesson-sidebar');
        const backdrop  = document.getElementById('sidebar-backdrop');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                backdrop.classList.toggle('active');
            });
        }
        if (backdrop) {
            backdrop.addEventListener('click', () => closeSidebar());
        }

        // Prev / Next
        document.getElementById('nav-prev').addEventListener('click', () => {
            if (currentIndex > 0) selectLesson(currentIndex - 1, courseCode);
        });
        document.getElementById('nav-next').addEventListener('click', () => {
            if (currentIndex < allLessons.length - 1) selectLesson(currentIndex + 1, courseCode);
        });
    }

    function closeSidebar() {
        document.getElementById('lesson-sidebar')?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('active');
    }

    function buildSidebar(lessons, courseCode) {
        const container = document.getElementById('sidebar-list');
        if (!container) return;

        // จัดกลุ่มตาม topic_name
        const groups = {};
        const groupOrder = [];
        lessons.forEach((lesson, idx) => {
            const topic = lesson.topic_name || 'บทเรียนทั่วไป';
            if (!groups[topic]) { groups[topic] = []; groupOrder.push(topic); }
            groups[topic].push({ lesson, idx });
        });

        container.innerHTML = groupOrder.map(topic => `
            <div class="sidebar-topic-group" role="group" aria-label="${escAttr(topic)}">
                <p class="sidebar-topic-label">${escHtml(topic)}</p>
                ${groups[topic].map(({ lesson, idx }) => {
                    const isOpened = openedSet.has(lesson.id);
                    return `
                        <button
                            class="sidebar-item${isOpened ? ' opened' : ''}"
                            data-idx="${idx}"
                            data-lesson-id="${escAttr(String(lesson.id))}"
                            type="button"
                            role="listitem"
                            title="${escAttr(lesson.lesson_title || '')}"
                        >
                            <span class="sidebar-num">${idx + 1}</span>
                            <span class="sidebar-item-text">
                                <span class="sidebar-item-title">${escHtml(lesson.lesson_title || 'ไม่มีชื่อ')}</span>
                                <span class="sidebar-opened-badge">✓ เปิดแล้ว</span>
                            </span>
                        </button>`;
                }).join('')}
            </div>
        `).join('');

        // Event delegation — robust against innerHTML re-renders
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.sidebar-item');
            if (!btn) return;
            const idx = Number(btn.dataset.idx);
            if (isNaN(idx)) return;
            selectLesson(idx, courseCode);
            closeSidebar();
        });
    }

    function selectLesson(idx, courseCode) {
        const lesson = allLessons[idx];
        if (!lesson) return;

        currentIndex = idx;

        // อัปเดต sidebar active + opened state
        document.querySelectorAll('.sidebar-item').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.idx) === idx);
        });

        // Meta bar
        setText('current-lesson-title', lesson.lesson_title || '');
        setText('current-lesson-topic', lesson.topic_name   || '');
        setText('lesson-counter', `${idx + 1} / ${allLessons.length}`);
        show('lesson-meta-bar');

        // ===== Video / PDF / No-content =====
        const embedUrl = getYouTubeEmbedUrl(lesson.youtube_url || '');
        const pdfFiles = parsePdfFiles(lesson.pdf_url);
        const hasPdf   = pdfFiles.length > 0;

        hide('video-wrap');
        hide('pdf-only-banner');
        hide('no-content');

        if (embedUrl) {
            const iframe = document.getElementById('lesson-video');
            if (iframe) iframe.src = embedUrl;
            show('video-wrap');
        } else if (hasPdf) {
            setText('pdf-only-title', lesson.lesson_title || '');
            show('pdf-only-banner');
        } else {
            show('no-content');
        }

        // ===== PDF row =====
        show('pdf-row');
        if (hasPdf) {
            renderPdfDocuments(pdfFiles);
            show('pdf-documents');
            hide('pdf-missing');
        } else {
            hide('pdf-documents');
            show('pdf-missing');
        }

        // ===== Nav =====
        const navPrev = document.getElementById('nav-prev');
        const navNext = document.getElementById('nav-next');
        if (navPrev) navPrev.disabled = (idx <= 0);
        if (navNext) navNext.disabled = (idx >= allLessons.length - 1);
        setText('nav-counter', `${idx + 1} / ${allLessons.length}`);
        show('lesson-nav');

        // ===== บันทึก "เปิดแล้ว" ลง lesson_progress =====
        markOpened(lesson, courseCode);
    }

    async function markOpened(lesson, courseCode) {
        if (!student?.id) return;

        // ถ้าเปิดแล้วในเซสชันนี้ ไม่ต้องเรียก API ซ้ำ
        if (openedSet.has(lesson.id)) return;

        openedSet.add(lesson.id);

        // อัปเดต UI badge ทันที — ค้นหาด้วย idx เพื่อหลีกเลี่ยงปัญหา UUID selector
        const lessonIdx = allLessons.findIndex(l => l.id === lesson.id);
        if (lessonIdx >= 0) {
            const btn = document.querySelector(`.sidebar-item[data-idx="${lessonIdx}"]`);
            if (btn) btn.classList.add('opened');
        }

        // Upsert ลง lesson_progress (ใช้ upsert เพื่อความปลอดภัย)
        try {
            await supabaseClient.from('lesson_progress').upsert({
                user_id:     student.id,
                lesson_id:   lesson.id,
                course_code: courseCode,
            }, { onConflict: 'user_id,lesson_id' });
        } catch (err) {
            console.warn('lesson_progress upsert failed:', err?.message);
        }
    }

    // ============================================================
    // Shared helpers
    // ============================================================
    function parsePdfFiles(value) {
        if (!value) return [];
        return String(value)
            .split(',')
            .map(url => url.trim())
            .filter(url => url && url !== 'null' && url !== 'undefined')
            .map((url, index) => ({
                url,
                name: getPdfFileName(url, index),
            }));
    }

    function getPdfFileName(url, index) {
        const fallback = `เอกสาร ${index + 1}`;
        try {
            const parsed = new URL(url);
            const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
            return prettifyFileName(lastSegment) || fallback;
        } catch (_) {
            const cleanUrl = String(url).split('?')[0].split('#')[0];
            const lastSegment = cleanUrl.split('/').filter(Boolean).pop();
            return prettifyFileName(lastSegment) || fallback;
        }
    }

    function prettifyFileName(fileName) {
        if (!fileName) return '';
        try {
            fileName = decodeURIComponent(fileName);
        } catch (_) {}
        return fileName
            .replace(/\.[a-z0-9]{2,8}$/i, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function renderPdfDocuments(files) {
        const wrap = document.getElementById('pdf-documents');
        if (!wrap) return;
        wrap.innerHTML = `
            <p class="pdf-documents-title">เอกสารประกอบการเรียน</p>
            <div class="pdf-documents-list">
                ${files.map((file, index) => `
                    <a class="pdf-open-btn" href="${escAttr(file.url)}" target="_blank" rel="noopener">
                        <span class="pdf-file-icon">📄</span>
                        <span class="pdf-file-text">
                            <span class="pdf-file-name">${escHtml(file.name)}</span>
                            <span class="pdf-file-meta">ไฟล์ที่ ${index + 1}</span>
                        </span>
                    </a>
                `).join('')}
            </div>`;
    }

    function getYouTubeEmbedUrl(url) {
        if (!url) return '';
        const value = String(url).trim();
        if (!value) return '';

        // Raw 11-char video ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
            return `https://www.youtube.com/embed/${value}`;
        }

        try {
            const parsed = new URL(value);
            let videoId = '';

            if (parsed.hostname === 'youtu.be') {
                videoId = parsed.pathname.slice(1).split('?')[0];
            } else if (parsed.hostname.includes('youtube.com')) {
                if (parsed.searchParams.get('v')) {
                    videoId = parsed.searchParams.get('v');
                } else if (parsed.pathname.includes('/embed/')) {
                    videoId = parsed.pathname.split('/embed/')[1].split('?')[0];
                } else if (parsed.pathname.includes('/shorts/')) {
                    videoId = parsed.pathname.split('/shorts/')[1].split('?')[0];
                }
            }

            return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
        } catch {
            return '';
        }
    }

    function getInitials(name) {
        const parts = name.trim().split(/\s+/);
        if (!parts[0]) return '?';
        return parts[0].charAt(0).toUpperCase();
    }

    function formatPhone(phone) {
        // แสดงเฉพาะ 4 ตัวท้าย เพื่อความเป็นส่วนตัว เช่น 081-xxx-5678
        if (!phone || phone.length < 4) return phone;
        return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') || phone;
    }

    function bindLogout() {
        const btn = document.getElementById('logout-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            window.location.href = 'index.html';
        });
    }

    function readStudent() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
        catch { return null; }
    }

    function formatSchedule(course) {
        const parts = [course.schedule_day, course.schedule_time].filter(Boolean);
        return parts.length ? parts.join(' ') : 'ยังไม่ระบุตารางเรียน';
    }

    function show(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    }

    function hide(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function showMessage(text) {
        setText('page-message', text);
    }

    function escHtml(value) {
        return String(value || '')
            .replaceAll('&',  '&amp;')
            .replaceAll('<',  '&lt;')
            .replaceAll('>',  '&gt;')
            .replaceAll('"',  '&quot;')
            .replaceAll("'", '&#39;');
    }

    function escAttr(value) {
        return escHtml(value).replaceAll('`', '&#96;');
    }
});
