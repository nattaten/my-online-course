// ==============================
// CONFIG
// ==============================
const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';
const ADMIN_PASSWORD = 'admin1234'; // เปลี่ยนได้

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================
// INIT
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-pass')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') checkAdminLogin();
    });

    // Tab nav: sidebar + bottom nav
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            switchTab(link.dataset.tab);
        });
    });

    // Content type toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateContentFields(btn.dataset.type);
        });
    });

    // Month picker
    const mp = document.getElementById('month-picker');
    if (mp) {
        const now = new Date();
        mp.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        mp.addEventListener('change', loadMonthlySummary);
    }

    // Close modals on backdrop click
    ['confirm-modal','edit-student-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target.id === id) {
                id === 'confirm-modal' ? closeModal() : closeEditStudentModal();
            }
        });
    });
});

function updateContentFields(type) {
    const vf = document.getElementById('video-fields');
    const pf = document.getElementById('pdf-fields');
    if (!vf || !pf) return;
    vf.style.display = type === 'pdf'   ? 'none' : 'block';
    pf.style.display = type === 'video' ? 'none' : 'block';
}

// ==============================
// LOGIN
// ==============================
function checkAdminLogin() {
    const input = document.getElementById('admin-pass').value;
    const err   = document.getElementById('login-err');
    if (input === ADMIN_PASSWORD) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display    = 'flex';
        initDashboard();
    } else {
        err.textContent = 'รหัสผ่านไม่ถูกต้อง';
        document.getElementById('admin-pass').value = '';
    }
}
function adminLogout() { location.reload(); }

// ==============================
// DASHBOARD INIT
// ==============================
async function initDashboard() {
    await Promise.all([
        loadStats(), loadRecentStudents(),
        loadCourseDropdowns(), loadCourseList(),
        loadLessonList(), loadStudentList(),
        initFinance(),
    ]);
}

// ==============================
// TAB SWITCHING
// ==============================
function switchTab(tabName) {
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(l => l.classList.remove('active'));
    document.getElementById('tab-' + tabName)?.classList.add('active');
    document.querySelectorAll(`[data-tab="${tabName}"]`).forEach(el => el.classList.add('active'));
}

// ==============================
// STATS
// ==============================
async function loadStats() {
    const [courses, lessons, students] = await Promise.all([
        sb.from('courses').select('id', { count:'exact', head:true }),
        sb.from('lessons').select('id', { count:'exact', head:true }),
        sb.from('users_courses').select('id', { count:'exact', head:true }),
    ]);
    document.getElementById('stat-courses').textContent  = courses.count  ?? '—';
    document.getElementById('stat-lessons').textContent  = lessons.count  ?? '—';
    document.getElementById('stat-students').textContent = students.count ?? '—';

    const weekStr = getWeekStart(new Date()).toISOString().split('T')[0];
    const { data: sessions } = await sb.from('weekly_sessions').select('fee,taught,paid').eq('week_start', weekStr).eq('taught', true);
    const income = (sessions||[]).filter(s=>s.paid).reduce((a,s)=>a+(s.fee||0),0);
    document.getElementById('stat-week-income').textContent = '฿' + income.toLocaleString();
}

async function loadRecentStudents() {
    const { data } = await sb.from('users_courses').select('*').order('id',{ascending:false}).limit(8);
    const el = document.getElementById('recent-students');
    if (!data?.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีนักเรียน</div>'; return; }
    el.innerHTML = `<table class="recent-table">
        <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>คอร์ส</th><th>หมายเหตุ</th></tr></thead>
        <tbody>${data.map(s=>`<tr>
            <td>${s.name||'—'}</td>
            <td style="font-family:var(--mono);font-size:11px;">${s.email}</td>
            <td><span class="badge badge-blue">${s.course_name}</span></td>
            <td>${s.note||'—'}</td>
        </tr>`).join('')}</tbody></table>`;
}

// ==============================
// COURSE DROPDOWNS
// ==============================
let _allCourses = [];

async function loadCourseDropdowns() {
    const { data } = await sb.from('courses').select('*').order('id');
    _allCourses = data || [];
    const opts      = '<option value="">-- เลือกคอร์ส --</option>'  + _allCourses.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
    const filterOpt = '<option value="">— ทุกคอร์ส —</option>'      + _allCourses.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
    ['lesson-course-select','stu-course','edit-stu-course'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=opts; });
    ['lesson-filter-course','stu-filter-course'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=filterOpt; });
}

// ==============================
// COURSES
// ==============================
async function loadCourseList() {
    const { data } = await sb.from('courses').select('*').order('id');
    const el = document.getElementById('course-list');
    if (!data?.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีคอร์ส</div>'; return; }
    el.innerHTML = data.map(c=>`
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-name">📚 ${c.name}</div>
                <div class="list-item-sub">ID: ${c.id}</div>
            </div>
            <button class="icon-btn delete" onclick="confirmDelete('ลบคอร์ส &quot;${c.name}&quot;?', ()=>deleteCourse(${c.id}))">🗑</button>
        </div>`).join('');
}

async function addCourse() {
    const nameInput = document.getElementById('new-course-name');
    const msg = document.getElementById('course-msg');
    const name = nameInput.value.trim();
    if (!name) { showMsg(msg,'กรุณากรอกชื่อคอร์ส','error'); return; }
    const { error } = await sb.from('courses').insert([{ name }]);
    if (error) { showMsg(msg,'เกิดข้อผิดพลาด: '+error.message,'error'); return; }
    showMsg(msg,`✅ เพิ่มคอร์ส "${name}" สำเร็จ`,'success');
    nameInput.value = '';
    await Promise.all([loadCourseList(), loadCourseDropdowns(), loadStats(), loadFeeSettings()]);
}

async function deleteCourse(id) {
    const { error } = await sb.from('courses').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: '+error.message); return; }
    await Promise.all([loadCourseList(), loadCourseDropdowns(), loadStats()]);
}

// ==============================
// LESSONS
// ==============================
async function loadLessonList() {
    const course = document.getElementById('lesson-filter-course')?.value;
    let q = sb.from('lessons').select('*').order('order_no',{ascending:true});
    if (course) q = q.eq('course_name', course);
    const { data } = await q;
    const el = document.getElementById('lesson-list');
    if (!data?.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีบทเรียน</div>'; return; }
    el.innerHTML = data.map(l=>`
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-name">${l.vimeo_id?'🎬':'📄'} ${l.lesson_title}</div>
                <div class="list-item-sub">${l.course_name} · ${l.topic_name||'—'} · #${l.order_no}</div>
                ${l.pdf_url?`<div class="list-item-sub" style="color:#6ee7b7;">📄 มีเอกสาร</div>`:''}
            </div>
            <button class="icon-btn delete" onclick="confirmDelete('ลบบทเรียน &quot;${l.lesson_title}&quot;?', ()=>deleteLesson(${l.id}))">🗑</button>
        </div>`).join('');
}

async function saveLesson() {
    const msg        = document.getElementById('lesson-msg');
    const courseName = document.getElementById('lesson-course-select').value;
    const topicName  = document.getElementById('topic-name').value.trim();
    const title      = document.getElementById('lesson-title').value.trim();
    const orderNo    = document.getElementById('order-no').value;
    const pdfUrl     = document.getElementById('pdf-url').value.trim();
    const activeType = document.querySelector('.toggle-btn.active')?.dataset.type || 'both';
    const videoId    = activeType !== 'pdf' ? document.getElementById('video-id').value.trim() : null;

    if (!courseName || !title) { showMsg(msg,'กรุณากรอกคอร์สและชื่อบทเรียน','error'); return; }
    if (activeType !== 'pdf'   && !videoId) { showMsg(msg,'กรุณากรอก ID วิดีโอ','error'); return; }
    if (activeType !== 'video' && !pdfUrl)  { showMsg(msg,'กรุณากรอกลิงก์ PDF','error'); return; }

    const { error } = await sb.from('lessons').insert([{
        course_name:  courseName,
        topic_name:   topicName || 'ทั่วไป',
        lesson_title: title,
        vimeo_id:     videoId || null,
        order_no:     parseInt(orderNo) || 1,
        pdf_url:      pdfUrl || null,
    }]);
    if (error) { showMsg(msg,'เกิดข้อผิดพลาด: '+error.message,'error'); return; }
    showMsg(msg,'✅ บันทึกบทเรียนสำเร็จ','success');
    document.getElementById('lesson-title').value = '';
    document.getElementById('video-id').value     = '';
    document.getElementById('pdf-url').value      = '';
    document.getElementById('order-no').value     = parseInt(orderNo) + 1;
    await Promise.all([loadLessonList(), loadStats()]);
}

async function deleteLesson(id) {
    const { error } = await sb.from('lessons').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: '+error.message); return; }
    await Promise.all([loadLessonList(), loadStats()]);
}

// ==============================
// STUDENTS
// ==============================
async function loadStudentList() {
    const course = document.getElementById('stu-filter-course')?.value;
    const search = document.getElementById('stu-search')?.value.trim().toLowerCase();
    let q = sb.from('users_courses').select('*').order('id',{ascending:false});
    if (course) q = q.eq('course_name', course);
    const { data } = await q;
    const el = document.getElementById('student-list');
    if (!data?.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีนักเรียน</div>'; return; }
    const filtered = search ? data.filter(s=>(s.name||'').toLowerCase().includes(search)||(s.email||'').toLowerCase().includes(search)) : data;
    if (!filtered.length) { el.innerHTML = '<div class="empty-state">ไม่พบนักเรียนที่ค้นหา</div>'; return; }
    el.innerHTML = filtered.map(s=>`
        <div class="list-item">
            <div class="list-item-info">
                <div class="list-item-name">👤 ${s.name||'(ไม่ระบุชื่อ)'}</div>
                <div class="list-item-sub">${s.email}</div>
                ${s.note?`<div class="list-item-sub">${s.note}</div>`:''}
            </div>
            <span class="badge badge-blue">${s.course_name}</span>
            <button class="icon-btn edit" onclick='openEditStudentModal(${JSON.stringify(s)})'>✏️</button>
            <button class="icon-btn delete" onclick="confirmDelete('ลบนักเรียน &quot;${s.email}&quot;?', ()=>deleteStudent(${s.id}))">🗑</button>
        </div>`).join('');
}

async function addStudent() {
    const msg      = document.getElementById('student-msg');
    const name     = document.getElementById('stu-name').value.trim();
    const email    = document.getElementById('stu-email').value.trim();
    const password = document.getElementById('stu-password').value.trim();
    const course   = document.getElementById('stu-course').value;
    const note     = document.getElementById('stu-note').value.trim();
    if (!email||!password||!course) { showMsg(msg,'กรุณากรอกอีเมล รหัสผ่าน และเลือกคอร์ส','error'); return; }
    const { data: existing } = await sb.from('users_courses').select('id').eq('email',email).eq('course_name',course).limit(1);
    if (existing?.length) { showMsg(msg,`⚠️ "${email}" มีคอร์ส "${course}" อยู่แล้ว`,'error'); return; }
    const { error } = await sb.from('users_courses').insert([{ name:name||null, email, password, course_name:course, note:note||null }]);
    if (error) { showMsg(msg,'เกิดข้อผิดพลาด: '+error.message,'error'); return; }
    showMsg(msg,`✅ เพิ่มนักเรียน "${email}" สำเร็จ`,'success');
    ['stu-name','stu-email','stu-password','stu-note'].forEach(id=>{ document.getElementById(id).value=''; });
    await Promise.all([loadStudentList(), loadRecentStudents(), loadStats()]);
}

async function deleteStudent(id) {
    const { error } = await sb.from('users_courses').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: '+error.message); return; }
    await Promise.all([loadStudentList(), loadRecentStudents(), loadStats()]);
}

// ==============================
// EDIT STUDENT MODAL
// ==============================
function openEditStudentModal(student) {
    document.getElementById('edit-stu-id').value       = student.id;
    document.getElementById('edit-stu-name').value     = student.name     || '';
    document.getElementById('edit-stu-email').value    = student.email    || '';
    document.getElementById('edit-stu-password').value = student.password || '';
    document.getElementById('edit-stu-note').value     = student.note     || '';
    document.getElementById('edit-stu-msg').textContent = '';

    const sel = document.getElementById('edit-stu-course');
    if (sel) sel.innerHTML = _allCourses.map(c =>
        `<option value="${c.name}" ${c.name===student.course_name?'selected':''}>${c.name}</option>`
    ).join('');

    document.getElementById('edit-student-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('edit-stu-name')?.focus(), 150);
}

function closeEditStudentModal() {
    document.getElementById('edit-student-modal').style.display = 'none';
}

async function saveStudentModal() {
    const id       = document.getElementById('edit-stu-id').value;
    const name     = document.getElementById('edit-stu-name').value.trim();
    const email    = document.getElementById('edit-stu-email').value.trim();
    const password = document.getElementById('edit-stu-password').value.trim();
    const course   = document.getElementById('edit-stu-course').value;
    const note     = document.getElementById('edit-stu-note').value.trim();
    const msg      = document.getElementById('edit-stu-msg');

    if (!email||!password||!course) { showMsg(msg,'กรุณากรอกให้ครบ','error'); return; }

    const saveBtn = document.querySelector('#edit-student-modal .btn-success');
    if (saveBtn) { saveBtn.disabled=true; saveBtn.textContent='กำลังบันทึก...'; }

    const { error } = await sb.from('users_courses').update({
        name:name||null, email, password, course_name:course, note:note||null
    }).eq('id', id);

    if (saveBtn) { saveBtn.disabled=false; saveBtn.textContent='💾 บันทึก'; }

    if (error) { showMsg(msg,'บันทึกไม่สำเร็จ: '+error.message,'error'); return; }
    closeEditStudentModal();
    await Promise.all([loadStudentList(), loadRecentStudents()]);
}

// ==============================
// FINANCE — WEEK HELPERS
// ==============================
let _currentWeekStart = getWeekStart(new Date());

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
}

function formatWeekLabel(weekStart) {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const opts = { day:'numeric', month:'short', year:'numeric' };
    return `${weekStart.toLocaleDateString('th-TH',opts)} — ${end.toLocaleDateString('th-TH',opts)}`;
}

function changeWeek(dir) {
    _currentWeekStart = new Date(_currentWeekStart);
    _currentWeekStart.setDate(_currentWeekStart.getDate() + dir*7);
    loadWeekSessions();
}

function goToCurrentWeek() {
    _currentWeekStart = getWeekStart(new Date());
    loadWeekSessions();
}

async function initFinance() {
    await Promise.all([loadWeekSessions(), loadFeeSettings(), loadMonthlySummary()]);
}

// ==============================
// FINANCE — WEEK SESSIONS
// ==============================
async function loadWeekSessions() {
    document.getElementById('week-label').textContent = formatWeekLabel(_currentWeekStart);
    const weekStr = _currentWeekStart.toISOString().split('T')[0];

    const { data: courses } = await sb.from('courses').select('*').order('id');
    if (!courses?.length) {
        document.getElementById('session-list').innerHTML = '<div class="empty-state">ยังไม่มีคอร์ส</div>';
        return;
    }

    const { data: existing } = await sb.from('weekly_sessions').select('*').eq('week_start', weekStr);
    const sessionMap = {};
    (existing||[]).forEach(s => { sessionMap[s.course_name] = s; });

    const lastFeeMap = await getLastFeeMap(weekStr);

    // สร้าง sessions ที่ยังไม่มีสัปดาห์นี้
    const toInsert = courses.filter(c => !sessionMap[c.name]).map(c => ({
        course_name: c.name,
        week_start:  weekStr,
        fee:         lastFeeMap[c.name] || 0,
        taught:      false,
        paid:        false,
    }));

    if (toInsert.length > 0) {
        const { data: inserted } = await sb.from('weekly_sessions').insert(toInsert).select();
        (inserted||[]).forEach(s => { sessionMap[s.course_name] = s; });
    }

    const { data: allSessions } = await sb.from('weekly_sessions').select('*').eq('week_start', weekStr).order('course_name');
    renderSessionList(allSessions || []);
    updateFinanceSummary(allSessions || []);
}

async function getLastFeeMap(excludeWeek) {
    // ดึง fee ล่าสุดของแต่ละ course (ไม่รวมสัปดาห์ปัจจุบัน เพื่อดึง default จากอดีต)
    const { data } = await sb.from('weekly_sessions').select('course_name,fee,week_start').order('week_start',{ascending:false});
    const map = {};
    (data||[]).forEach(s => {
        if (s.week_start !== excludeWeek && !map[s.course_name]) map[s.course_name] = s.fee;
    });
    return map;
}

function renderSessionList(sessions) {
    const el = document.getElementById('session-list');
    if (!sessions.length) { el.innerHTML = '<div class="empty-state">ไม่พบข้อมูล</div>'; return; }
    el.innerHTML = sessions.map(s => {
        const tOn = s.taught ? 'on' : '';
        const pOn = (s.taught && s.paid) ? 'on' : '';
        const cls = s.paid ? 'paid' : (s.taught ? 'taught' : '');
        return `
        <div class="session-card ${cls}" id="sess-${s.id}">
            <div class="session-top">
                <span class="session-name">${s.course_name}</span>
                <span class="session-fee">฿${(s.fee||0).toLocaleString()}</span>
            </div>
            <div class="session-actions">
                <button class="session-btn taught-btn ${tOn}" onclick="toggleSession(${s.id},'taught',${!s.taught})">
                    ${s.taught ? '✅ สอนแล้ว' : '○ ยังไม่ได้สอน'}
                </button>
                <button class="session-btn paid-btn ${pOn}" onclick="toggleSession(${s.id},'paid',${!s.paid})" ${!s.taught?'disabled':''}>
                    ${s.paid ? '💚 จ่ายแล้ว' : '○ ยังไม่จ่าย'}
                </button>
            </div>
        </div>`;
    }).join('');
}

async function toggleSession(id, field, value) {
    const update = { [field]: value };
    if (field==='paid'   && value)  update.paid_at = new Date().toISOString();
    if (field==='paid'   && !value) update.paid_at = null;
    if (field==='taught' && !value) { update.paid = false; update.paid_at = null; }
    const { error } = await sb.from('weekly_sessions').update(update).eq('id', id);
    if (error) { alert('อัปเดตไม่สำเร็จ: '+error.message); return; }
    await loadWeekSessions();
    await loadStats();
}

function updateFinanceSummary(sessions) {
    const taught   = sessions.filter(s=>s.taught);
    const expected = taught.reduce((a,s)=>a+(s.fee||0),0);
    const received = taught.filter(s=>s.paid).reduce((a,s)=>a+(s.fee||0),0);
    document.getElementById('fin-expected').textContent = '฿'+expected.toLocaleString();
    document.getElementById('fin-received').textContent = '฿'+received.toLocaleString();
    document.getElementById('fin-pending').textContent  = '฿'+(expected-received).toLocaleString();
}

// ==============================
// FEE SETTINGS
// ==============================
async function loadFeeSettings() {
    const { data: courses } = await sb.from('courses').select('*').order('id');
    const weekStr = _currentWeekStart.toISOString().split('T')[0];
    const { data: sessions } = await sb.from('weekly_sessions').select('course_name,fee').eq('week_start', weekStr);
    const feeMap = {};
    (sessions||[]).forEach(s => { feeMap[s.course_name] = s.fee; });
    const lastFeeMap = await getLastFeeMap(null);

    const el = document.getElementById('fee-settings');
    if (!courses?.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีคอร์ส</div>'; return; }
    el.innerHTML = courses.map(c=>`
        <div class="fee-item">
            <span class="fee-item-name">${c.name}</span>
            <input class="fee-input" type="number" id="fee-${c.name.replace(/\s/g,'_')}"
                value="${feeMap[c.name] ?? lastFeeMap[c.name] ?? 0}" min="0" step="50">
            <button class="fee-save-btn" onclick="saveFee('${c.name}')">บันทึก</button>
        </div>`).join('');
}

async function saveFee(courseName) {
    const safeId = courseName.replace(/\s/g,'_');
    const val = parseInt(document.getElementById(`fee-${safeId}`)?.value) || 0;
    const weekStr = _currentWeekStart.toISOString().split('T')[0];
    const { data: existing } = await sb.from('weekly_sessions').select('id').eq('course_name',courseName).eq('week_start',weekStr).limit(1);
    if (existing?.length) {
        await sb.from('weekly_sessions').update({ fee:val }).eq('id', existing[0].id);
    }
    await loadWeekSessions();
}

// ==============================
// MONTHLY SUMMARY
// ==============================
async function loadMonthlySummary() {
    const picker = document.getElementById('month-picker');
    if (!picker?.value) return;
    const [year, month] = picker.value.split('-').map(Number);
    const startStr = new Date(year, month-1, 1).toISOString().split('T')[0];
    const endStr   = new Date(year, month, 0).toISOString().split('T')[0];

    const { data } = await sb.from('weekly_sessions')
        .select('*').gte('week_start',startStr).lte('week_start',endStr)
        .eq('taught',true).order('week_start');

    const el = document.getElementById('month-summary');
    if (!data?.length) { el.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text-muted)">ไม่มีข้อมูลเดือนนี้</div>'; return; }

    const byWeek = {};
    data.forEach(s => { if(!byWeek[s.week_start]) byWeek[s.week_start]=[]; byWeek[s.week_start].push(s); });

    const totalExpected = data.reduce((a,s)=>a+(s.fee||0),0);
    const totalReceived = data.filter(s=>s.paid).reduce((a,s)=>a+(s.fee||0),0);

    let html = '';
    Object.entries(byWeek).forEach(([ws, sessions]) => {
        const d = new Date(ws); const e = new Date(ws); e.setDate(e.getDate()+6);
        const lbl = `${d.getDate()}/${d.getMonth()+1} – ${e.getDate()}/${e.getMonth()+1}`;
        const wTotal = sessions.reduce((a,s)=>a+(s.fee||0),0);
        const wPaid  = sessions.filter(s=>s.paid).reduce((a,s)=>a+(s.fee||0),0);
        html += `<div class="month-row">
            <span>${lbl}</span>
            <span class="month-val">
                ${wPaid>0?`<span class="green">฿${wPaid.toLocaleString()}</span>`:''}
                ${wPaid<wTotal?`<span class="orange"> ค้าง฿${(wTotal-wPaid).toLocaleString()}</span>`:''}
            </span>
        </div>`;
    });
    html += `
        <div class="month-row month-row-total"><span>รวมทั้งเดือน</span><span class="month-val">฿${totalExpected.toLocaleString()}</span></div>
        <div class="month-row"><span>ได้รับแล้ว</span><span class="month-val green">฿${totalReceived.toLocaleString()}</span></div>
        <div class="month-row"><span>ค้างจ่าย</span><span class="month-val orange">฿${(totalExpected-totalReceived).toLocaleString()}</span></div>`;
    el.innerHTML = html;
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
        closeModal(); if (_pendingAction) await _pendingAction(); _pendingAction=null;
    };
}
function closeModal() { document.getElementById('confirm-modal').style.display = 'none'; }

// ==============================
// HELPERS
// ==============================
function showMsg(el, text, type) {
    el.textContent = text; el.className = 'form-msg '+type;
    setTimeout(()=>{ el.textContent=''; el.className='form-msg'; }, 4000);
}