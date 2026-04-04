// ==============================
// CONFIG
// ==============================
const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';

// ⚠️ เปลี่ยนรหัสผ่านแอดมินตรงนี้ได้เลย
const ADMIN_PASSWORD = 'admin1234';

// ==============================
// INIT
// ==============================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', () => {
    // กด Enter เพื่อ login ได้
    document.getElementById('admin-pass')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') checkAdminLogin();
    });

    // Tab navigation
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const tab = link.dataset.tab;
            switchTab(tab);
        });
    });
});

// ==============================
// ADMIN LOGIN (client-side password)
// ==============================
function checkAdminLogin() {
    const input = document.getElementById('admin-pass').value;
    const err   = document.getElementById('login-err');
    const btn   = document.getElementById('login-submit-btn');

    if (input === ADMIN_PASSWORD) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display    = 'flex';
        initDashboard();
    } else {
        err.textContent = '❌ รหัสผ่านไม่ถูกต้อง';
        btn.style.animation = 'none';
        setTimeout(() => btn.style.animation = '', 300);
        document.getElementById('admin-pass').value = '';
    }
}

function adminLogout() {
    location.reload();
}

// ==============================
// INIT DASHBOARD
// ==============================
async function initDashboard() {
    await Promise.all([
        loadStats(),
        loadRecentStudents(),
        loadCourseDropdowns(),
        loadCourseList(),
        loadLessonList(),
        loadStudentList(),
    ]);
}

// ==============================
// TAB SWITCHING
// ==============================
function switchTab(tabName) {
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));

    document.getElementById('tab-' + tabName)?.classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
}

// ==============================
// STATS (Overview)
// ==============================
async function loadStats() {
    const [courses, lessons, students] = await Promise.all([
        sb.from('courses').select('id', { count: 'exact', head: true }),
        sb.from('lessons').select('id', { count: 'exact', head: true }),
        sb.from('users_courses').select('id', { count: 'exact', head: true }),
    ]);

    document.getElementById('stat-courses').textContent  = courses.count  ?? '—';
    document.getElementById('stat-lessons').textContent  = lessons.count  ?? '—';
    document.getElementById('stat-students').textContent = students.count ?? '—';

    // นับ lessons ที่มี pdf_url
    const { count: pdfCount } = await sb
        .from('lessons')
        .select('id', { count: 'exact', head: true })
        .not('pdf_url', 'is', null)
        .neq('pdf_url', '');
    document.getElementById('stat-pdfs').textContent = pdfCount ?? '—';
}

async function loadRecentStudents() {
    const { data, error } = await sb
        .from('users_courses')
        .select('*')
        .order('id', { ascending: false })
        .limit(8);

    const el = document.getElementById('recent-students');
    if (error || !data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีนักเรียน</div>';
        return;
    }

    el.innerHTML = `
        <table class="recent-table">
            <thead><tr>
                <th>ชื่อ</th>
                <th>อีเมล</th>
                <th>คอร์ส</th>
                <th>หมายเหตุ</th>
            </tr></thead>
            <tbody>
                ${data.map(s => `
                    <tr>
                        <td>${s.name || '—'}</td>
                        <td style="font-family:var(--mono); font-size:12px;">${s.email}</td>
                        <td><span class="badge badge-blue">${s.course_name}</span></td>
                        <td>${s.note || '—'}</td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
}

// ==============================
// COURSE DROPDOWNS
// ==============================
async function loadCourseDropdowns() {
    const { data, error } = await sb.from('courses').select('*').order('id');
    if (error || !data) return;

    const opts = '<option value="">-- เลือกคอร์ส --</option>' +
        data.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    const emptyOpt = '<option value="">— ทุกคอร์ส —</option>' +
        data.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    ['lesson-course-select', 'stu-course'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });

    ['lesson-filter-course', 'stu-filter-course'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = emptyOpt;
    });
}

// ==============================
// COURSES
// ==============================
async function loadCourseList() {
    const { data, error } = await sb.from('courses').select('*').order('id');
    const el = document.getElementById('course-list');

    if (error || !data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีคอร์ส</div>';
        return;
    }

    el.innerHTML = data.map(c => `
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-name">📚 ${c.name}</div>
                <div class="list-item-sub">ID: ${c.id}</div>
            </div>
            <button class="delete-btn" onclick="confirmDelete('ลบคอร์ส &quot;${c.name}&quot;?', () => deleteCourse(${c.id}, '${c.name}'))">🗑</button>
        </div>`).join('');
}

async function addCourse() {
    const nameInput = document.getElementById('new-course-name');
    const msg       = document.getElementById('course-msg');
    const name      = nameInput.value.trim();

    if (!name) { showMsg(msg, 'กรุณากรอกชื่อคอร์ส', 'error'); return; }

    const { error } = await sb.from('courses').insert([{ name }]);
    if (error) {
        showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error');
    } else {
        showMsg(msg, `✅ เพิ่มคอร์ส "${name}" สำเร็จ`, 'success');
        nameInput.value = '';
        await loadCourseList();
        await loadCourseDropdowns();
        await loadStats();
    }
}

async function deleteCourse(id, name) {
    const { error } = await sb.from('courses').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await loadCourseList();
    await loadCourseDropdowns();
    await loadStats();
}

// ==============================
// LESSONS
// ==============================
async function loadLessonList() {
    const course = document.getElementById('lesson-filter-course')?.value;
    let query = sb.from('lessons').select('*').order('order_no', { ascending: true });
    if (course) query = query.eq('course_name', course);

    const { data, error } = await query;
    const el = document.getElementById('lesson-list');

    if (error || !data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีบทเรียน</div>';
        return;
    }

    el.innerHTML = data.map(l => `
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-name">🎬 ${l.lesson_title}</div>
                <div class="list-item-sub">${l.course_name} · ${l.topic_name || '—'} · #${l.order_no}</div>
                ${l.pdf_url ? `<div class="list-item-sub" style="color:#6ee7b7;">📄 มีเอกสาร</div>` : ''}
            </div>
            <span class="badge badge-orange">${l.vimeo_id}</span>
            <button class="delete-btn" onclick="confirmDelete('ลบบทเรียน &quot;${l.lesson_title}&quot;?', () => deleteLesson(${l.id}))">🗑</button>
        </div>`).join('');
}

async function saveLesson() {
    const msg        = document.getElementById('lesson-msg');
    const courseName = document.getElementById('lesson-course-select').value;
    const topicName  = document.getElementById('topic-name').value.trim();
    const title      = document.getElementById('lesson-title').value.trim();
    const videoId    = document.getElementById('video-id').value.trim();
    const orderNo    = document.getElementById('order-no').value;
    const pdfUrl     = document.getElementById('pdf-url').value.trim();

    if (!courseName || !title || !videoId) {
        showMsg(msg, 'กรุณากรอกข้อมูลให้ครบ (คอร์ส, ชื่อบทเรียน, ID วิดีโอ)', 'error');
        return;
    }

    const lessonData = {
        course_name:  courseName,
        topic_name:   topicName || 'ทั่วไป',
        lesson_title: title,
        vimeo_id:     videoId,
        order_no:     parseInt(orderNo) || 1,
        pdf_url:      pdfUrl || null,
    };

    const { error } = await sb.from('lessons').insert([lessonData]);
    if (error) {
        showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error');
    } else {
        showMsg(msg, '✅ บันทึกบทเรียนสำเร็จ', 'success');
        document.getElementById('lesson-title').value = '';
        document.getElementById('video-id').value     = '';
        document.getElementById('pdf-url').value      = '';
        document.getElementById('order-no').value     = parseInt(orderNo) + 1;
        await loadLessonList();
        await loadStats();
    }
}

async function deleteLesson(id) {
    const { error } = await sb.from('lessons').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await loadLessonList();
    await loadStats();
}

// ==============================
// STUDENTS
// ==============================
async function loadStudentList() {
    const course  = document.getElementById('stu-filter-course')?.value;
    const search  = document.getElementById('stu-search')?.value.trim().toLowerCase();

    let query = sb.from('users_courses').select('*').order('id', { ascending: false });
    if (course) query = query.eq('course_name', course);

    const { data, error } = await query;
    const el = document.getElementById('student-list');

    if (error || !data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีนักเรียน</div>';
        return;
    }

    // filter client-side by search keyword
    const filtered = search
        ? data.filter(s =>
            (s.name || '').toLowerCase().includes(search) ||
            (s.email || '').toLowerCase().includes(search))
        : data;

    if (!filtered.length) {
        el.innerHTML = '<div class="empty-state">ไม่พบนักเรียนที่ค้นหา</div>';
        return;
    }

    el.innerHTML = filtered.map(s => `
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-name">👤 ${s.name || '(ไม่ระบุชื่อ)'}</div>
                <div class="list-item-sub" style="font-family:var(--mono);">${s.email}</div>
                ${s.note ? `<div class="list-item-sub">${s.note}</div>` : ''}
            </div>
            <span class="badge badge-blue">${s.course_name}</span>
            <button class="delete-btn" onclick="confirmDelete('ลบนักเรียน &quot;${s.email}&quot;?', () => deleteStudent(${s.id}))">🗑</button>
        </div>`).join('');
}

async function addStudent() {
    const msg      = document.getElementById('student-msg');
    const name     = document.getElementById('stu-name').value.trim();
    const email    = document.getElementById('stu-email').value.trim();
    const password = document.getElementById('stu-password').value.trim();
    const course   = document.getElementById('stu-course').value;
    const note     = document.getElementById('stu-note').value.trim();

    if (!email || !password || !course) {
        showMsg(msg, 'กรุณากรอกอีเมล รหัสผ่าน และเลือกคอร์ส', 'error');
        return;
    }

    const { error } = await sb.from('users_courses').insert([{
        name:        name || null,
        email,
        password,
        course_name: course,
        note:        note || null,
    }]);

    if (error) {
        showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error');
    } else {
        showMsg(msg, `✅ เพิ่มนักเรียน "${email}" สำเร็จ`, 'success');
        ['stu-name','stu-email','stu-password','stu-note'].forEach(id => {
            document.getElementById(id).value = '';
        });
        await loadStudentList();
        await loadRecentStudents();
        await loadStats();
    }
}

async function deleteStudent(id) {
    const { error } = await sb.from('users_courses').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await loadStudentList();
    await loadRecentStudents();
    await loadStats();
}

// ==============================
// CONFIRM MODAL
// ==============================
let _pendingAction = null;

function confirmDelete(message, action) {
    _pendingAction = action;
    document.getElementById('modal-msg').innerHTML = message;
    document.getElementById('confirm-modal').style.display = 'flex';
    document.getElementById('modal-confirm-btn').onclick = async () => {
        closeModal();
        if (_pendingAction) await _pendingAction();
        _pendingAction = null;
    };
}

function closeModal() {
    document.getElementById('confirm-modal').style.display = 'none';
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('confirm-modal')?.addEventListener('click', e => {
        if (e.target.id === 'confirm-modal') closeModal();
    });
});

// ==============================
// HELPERS
// ==============================
function showMsg(el, text, type) {
    el.textContent = text;
    el.className   = 'form-msg ' + type;
    setTimeout(() => { el.textContent = ''; el.className = 'form-msg'; }, 4000);
}