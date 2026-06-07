document.addEventListener('DOMContentLoaded', () => {
    // ใส่ค่า Project URL และ anon public key จากหน้า Settings > API ของ Supabase
    const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';
    const STORAGE_KEY = 'studentProfile';

    if (typeof window.supabase === 'undefined') {
        showMessage('โหลด Supabase ไม่สำเร็จ');
        return;
    }

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const page = document.body.dataset.page;
    const student = readStudent();

    bindLogout();

    if (!student?.id) {
        window.location.href = 'index.html';
        return;
    }

    if (page === 'dashboard') loadDashboard(student);
    if (page === 'lesson') loadLessonPage(student);

    async function loadDashboard(currentStudent) {
        setText('student-email', `${currentStudent.name || 'นักเรียน'} · ${currentStudent.level || 'ไม่ระบุระดับชั้น'}`);
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

        renderCourses(data || []);
        setText('course-count', String(data?.length || 0));
        showMessage('');
    }

    async function loadLessonPage(currentStudent) {
        const courseCode = new URLSearchParams(window.location.search).get('code');

        if (!courseCode) {
            showMessage('ไม่พบรหัสคอร์ส');
            return;
        }

        showMessage('กำลังโหลดบทเรียน...');

        // ตรวจสิทธิ์ก่อนเข้าเรียน เพื่อกันการพิมพ์ URL เข้ามาตรง ๆ
        const { data: enrollment, error: enrollmentError } = await supabaseClient
            .from('enrollments')
            .select('id, course_code')
            .eq('user_id', currentStudent.id)
            .eq('course_code', courseCode)
            .maybeSingle();

        if (enrollmentError) {
            showMessage('ตรวจสอบสิทธิ์เรียนไม่สำเร็จ: ' + enrollmentError.message);
            return;
        }

        if (!enrollment) {
            showMessage('บัญชีนี้ไม่มีสิทธิ์เข้าคอร์สนี้');
            return;
        }

        const { data: course, error: courseError } = await supabaseClient
            .from('courses')
            .select('course_code, name, subject, schedule_day, schedule_time')
            .eq('course_code', courseCode)
            .maybeSingle();

        if (courseError) {
            showMessage('โหลดข้อมูลคอร์สไม่สำเร็จ: ' + courseError.message);
            return;
        }

        setText('course-title', course?.name || courseCode);
        setText('lesson-summary', `${course?.subject || 'ไม่ระบุวิชา'} · ${formatSchedule(course || {})}`);

        const { data: lessons, error: lessonError } = await supabaseClient
            .from('lessons')
            .select('id, course_code, lesson_title, topic_name, youtube_url, pdf_url, order_no')
            .eq('course_code', courseCode)
            .order('order_no', { ascending: true });

        if (lessonError) {
            showMessage('โหลดบทเรียนไม่สำเร็จ: ' + lessonError.message);
            return;
        }

        renderLessons(lessons || []);
        showMessage('');
    }

    function renderCourses(enrollments) {
        const grid = document.getElementById('course-grid');
        if (!grid) return;

        if (!enrollments.length) {
            grid.innerHTML = '<div class="student-empty">ยังไม่มีคอร์สเรียนในบัญชีนี้</div>';
            return;
        }

        grid.innerHTML = enrollments.map((enrollment, index) => {
            const course = enrollment.courses || {};
            const code = course.course_code || enrollment.course_code;

            return `
                <a class="student-course-card" href="lesson.html?code=${encodeURIComponent(code)}">
                    <span class="course-pill">${escHtml(code || `Course ${index + 1}`)}</span>
                    <h3>${escHtml(course.name || 'ไม่มีชื่อคอร์ส')}</h3>
                    <p class="course-meta">${escHtml(course.subject || 'ไม่ระบุวิชา')}</p>
                    <p class="course-meta">${escHtml(formatSchedule(course))}</p>
                </a>
            `;
        }).join('');
    }

    function renderLessons(lessons) {
        const container = document.getElementById('lesson-groups');
        if (!container) return;

        if (!lessons.length) {
            container.innerHTML = '<div class="student-empty">ยังไม่มีบทเรียนในคอร์สนี้</div>';
            return;
        }

        const groups = lessons.reduce((acc, lesson) => {
            const topic = lesson.topic_name || 'บทเรียนทั่วไป';
            if (!acc[topic]) acc[topic] = [];
            acc[topic].push(lesson);
            return acc;
        }, {});

        container.innerHTML = Object.entries(groups).map(([topic, items]) => `
            <section class="lesson-topic-block">
                <h2 class="lesson-topic-title">${escHtml(topic)}</h2>
                ${items.map(renderLessonCard).join('')}
            </section>
        `).join('');
    }

    function renderLessonCard(lesson, index) {
        const videoSrc = getYouTubeEmbedUrl(lesson.youtube_url || '');
        const hasPdf = lesson.pdf_url && lesson.pdf_url.trim() !== '' && lesson.pdf_url !== 'null';

        return `
            <article class="student-lesson-card">
                <div class="lesson-card-head">
                    <span class="lesson-number">${index + 1}</span>
                    <h3>${escHtml(lesson.lesson_title || 'ไม่มีชื่อบทเรียน')}</h3>
                </div>
                ${videoSrc ? `<iframe class="student-video" src="${escAttr(videoSrc)}" title="${escAttr(lesson.lesson_title || 'YouTube lesson')}" allowfullscreen></iframe>` : ''}
                <div class="lesson-card-foot">
                    <span class="student-muted">${escHtml(lesson.topic_name || 'บทเรียนทั่วไป')}</span>
                    ${hasPdf
                        ? `<a class="pdf-open-btn" href="${escAttr(lesson.pdf_url)}" target="_blank" rel="noopener">เปิดเอกสาร PDF</a>`
                        : '<span class="pdf-missing">ยังไม่มีเอกสาร PDF</span>'}
                </div>
            </article>
        `;
    }

    function getYouTubeEmbedUrl(url) {
        if (!url) return '';

        const value = String(url).trim();

        if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
            return `https://www.youtube.com/embed/${value}`;
        }

        try {
            const parsedUrl = new URL(value);
            let videoId = '';

            if (parsedUrl.hostname.includes('youtu.be')) {
                videoId = parsedUrl.pathname.replace('/', '');
            } else if (parsedUrl.searchParams.get('v')) {
                videoId = parsedUrl.searchParams.get('v');
            } else if (parsedUrl.pathname.includes('/embed/')) {
                videoId = parsedUrl.pathname.split('/embed/')[1];
            }

            return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
        } catch {
            return '';
        }
    }

    function bindLogout() {
        const logoutButton = document.getElementById('logout-btn');
        if (!logoutButton) return;

        logoutButton.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            window.location.href = 'index.html';
        });
    }

    function readStudent() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch {
            return null;
        }
    }

    function formatSchedule(course) {
        const day = course.schedule_day || '';
        const time = course.schedule_time || '';
        return [day, time].filter(Boolean).join(' ') || 'ยังไม่ระบุตารางเรียน';
    }

    function setText(id, text) {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    }

    function showMessage(text) {
        setText('page-message', text);
    }

    function escHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function escAttr(value) {
        return escHtml(value).replaceAll('`', '&#96;');
    }
});
