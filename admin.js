// ==============================
// CONFIG
// ==============================
const SUPABASE_URL   = 'https://zbekvirvhahjtocnitaq.supabase.co';
const SUPABASE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts';
const ADMIN_PASSWORD = 'admin1234';
const SESSION_KEY    = 'math_admin_v1';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================
// GLOBAL STATE
// ==============================
let _allCourses     = [];
let _currentLessons = [];
let _lessonMap      = {};
let _dragSrcId      = null;
let _pendingAction  = null;
let _chartIncome    = null;
let _chartStudents  = null;
let _currentWeekStart = getWeekStart(new Date());

// ==============================
// INIT
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    // ---- Session persistence ----
    if (localStorage.getItem(SESSION_KEY) === '1') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display    = 'flex';
        initDashboard();
    }

    document.getElementById('admin-pass')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') checkAdminLogin();
    });

    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            switchTab(link.dataset.tab);
        });
    });

    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateContentFields(btn.dataset.type);
        });
    });

    const mp = document.getElementById('month-picker');
    if (mp) {
        const now = new Date();
        mp.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        mp.addEventListener('change', loadMonthlySummary);
    }

    ['confirm-modal','edit-student-modal','edit-lesson-modal','preview-modal','duplicate-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target.id === id) {
                if (id === 'confirm-modal')       closeModal();
                else if (id === 'edit-student-modal') closeEditStudentModal();
                else if (id === 'edit-lesson-modal')  closeEditLessonModal();
                else if (id === 'preview-modal')      closePreviewModal();
                else if (id === 'duplicate-modal')    closeDuplicateModal();
            }
        });
    });

    // Global search keyboard shortcut
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openSearchOverlay();
        }
        if (e.key === 'Escape') {
            closeSearchOverlay();
            closeStudentDetailModal();
        }
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
        localStorage.setItem(SESSION_KEY, '1');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display    = 'flex';
        initDashboard();
    } else {
        err.textContent = 'รหัสผ่านไม่ถูกต้อง';
        document.getElementById('admin-pass').value = '';
    }
}

function adminLogout() {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
}

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
    loadCharts();
    loadUnpaidAlert();
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
// CHARTS
// ==============================
async function loadCharts() {
    await Promise.all([renderIncomeChart(), renderStudentsChart()]);
}

async function renderIncomeChart() {
    const months = getLast6Months();
    const firstMonth = months[0];
    const lastMonth  = months[months.length - 1];

    // Fetch range with overlap buffer for smart attribution
    const startFetch = new Date(firstMonth + '-01');
    startFetch.setDate(startFetch.getDate() - 6);
    const endFetch   = new Date(lastMonth + '-01');
    endFetch.setMonth(endFetch.getMonth() + 1);
    endFetch.setDate(0);

    const { data } = await sb.from('weekly_sessions')
        .select('*')
        .gte('week_start', startFetch.toISOString().split('T')[0])
        .lte('week_start', endFetch.toISOString().split('T')[0])
        .eq('taught', true);

    const incomeByMonth = {};
    const receivedByMonth = {};
    months.forEach(m => { incomeByMonth[m] = 0; receivedByMonth[m] = 0; });

    for (const session of (data || [])) {
        const attrs = attributeSessionFee(session);
        for (const a of attrs) {
            if (incomeByMonth.hasOwnProperty(a.month)) {
                incomeByMonth[a.month]    += a.amount;
                if (session.paid) receivedByMonth[a.month] += a.amount;
            }
        }
    }

    const labels   = months.map(m => formatMonthLabel(m));
    const totalArr = months.map(m => Math.round(incomeByMonth[m]));
    const recArr   = months.map(m => Math.round(receivedByMonth[m]));

    const ctx = document.getElementById('chart-income').getContext('2d');
    if (_chartIncome) _chartIncome.destroy();
    _chartIncome = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'ควรได้รับ',
                    data: totalArr,
                    backgroundColor: 'rgba(59,130,246,0.25)',
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    borderRadius: 6,
                },
                {
                    label: 'ได้รับแล้ว',
                    data: recArr,
                    backgroundColor: 'rgba(16,185,129,0.35)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    borderRadius: 6,
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ฿${ctx.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: '#2a3045' } },
                y: {
                    ticks: { color: '#94a3b8', callback: v => '฿'+v.toLocaleString() },
                    grid: { color: '#2a3045' },
                    beginAtZero: true,
                }
            }
        }
    });
}

async function renderStudentsChart() {
    const { data } = await sb.from('users_courses').select('course_name');
    const counts = {};
    (data || []).forEach(r => { counts[r.course_name] = (counts[r.course_name] || 0) + 1; });
    const labels = Object.keys(counts).sort();
    const values = labels.map(l => counts[l]);

    const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

    const ctx = document.getElementById('chart-students').getContext('2d');
    if (_chartStudents) _chartStudents.destroy();
    _chartStudents = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length] + '99'),
                borderColor:     labels.map((_, i) => COLORS[i % COLORS.length]),
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 11 }, padding: 10, boxWidth: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} คน`
                    }
                }
            },
        }
    });
}

function getLast6Months() {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return months;
}

function formatMonthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}

// ==============================
// COURSE DROPDOWNS
// ==============================
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
            <button class="icon-btn" title="ก็อปปี้คอร์ส" onclick="openDuplicateCourse(${c.id},'${c.name.replace(/'/g,"\\'")}')">📋</button>
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
    loadCharts();
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

    if (!data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีบทเรียน</div>';
        _currentLessons = [];
        return;
    }

    _currentLessons = data;
    _lessonMap = {};
    data.forEach(l => { _lessonMap[l.id] = l; });

    el.innerHTML = data.map(l => renderLessonItem(l)).join('');
    attachDragListeners();
}

function renderLessonItem(l) {
    const hasVideo = !!l.vimeo_id;
    const hasPdf   = !!l.pdf_url;
    return `
    <div class="list-item draggable" draggable="true" data-id="${l.id}" data-order="${l.order_no}">
        <span class="drag-handle" title="ลากเพื่อเรียงลำดับ">⣿</span>
        <div class="list-item-info">
            <div class="list-item-name">${hasVideo?'🎬':'📄'} ${l.lesson_title}</div>
            <div class="list-item-sub">${l.course_name} · ${l.topic_name||'—'} · #${l.order_no}</div>
            ${hasPdf?`<div class="list-item-sub" style="color:#6ee7b7;">📄 มีเอกสาร</div>`:''}
        </div>
        <button class="icon-btn preview" title="ดูตัวอย่าง" onclick="openPreviewModal(${l.id})">👁</button>
        <button class="icon-btn edit" title="แก้ไข" onclick="openEditLessonModal(${l.id})">✏️</button>
        <button class="icon-btn delete" title="ลบ" onclick="confirmDelete('ลบบทเรียน &quot;${l.lesson_title}&quot;?', ()=>deleteLesson(${l.id}))">🗑</button>
    </div>`;
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
// EDIT LESSON MODAL
// ==============================
function openEditLessonModal(id) {
    const l = _lessonMap[id];
    if (!l) return;

    document.getElementById('edit-lesson-id').value      = l.id;
    document.getElementById('edit-lesson-topic').value   = l.topic_name  || '';
    document.getElementById('edit-lesson-title').value   = l.lesson_title || '';
    document.getElementById('edit-lesson-videoid').value = l.vimeo_id    || '';
    document.getElementById('edit-lesson-order').value   = l.order_no    || 1;
    document.getElementById('edit-lesson-pdf').value     = l.pdf_url     || '';
    document.getElementById('edit-lesson-msg').textContent = '';

    const sel = document.getElementById('edit-lesson-course');
    sel.innerHTML = _allCourses.map(c =>
        `<option value="${c.name}" ${c.name === l.course_name ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    document.getElementById('edit-lesson-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('edit-lesson-title')?.focus(), 150);
}

function closeEditLessonModal() {
    document.getElementById('edit-lesson-modal').style.display = 'none';
}

async function saveEditLesson() {
    const id      = document.getElementById('edit-lesson-id').value;
    const course  = document.getElementById('edit-lesson-course').value;
    const topic   = document.getElementById('edit-lesson-topic').value.trim();
    const title   = document.getElementById('edit-lesson-title').value.trim();
    const videoId = document.getElementById('edit-lesson-videoid').value.trim();
    const orderNo = document.getElementById('edit-lesson-order').value;
    const pdfUrl  = document.getElementById('edit-lesson-pdf').value.trim();
    const msg     = document.getElementById('edit-lesson-msg');

    if (!course || !title) { showMsg(msg,'กรุณากรอกคอร์สและชื่อบทเรียน','error'); return; }

    const saveBtn = document.querySelector('#edit-lesson-modal .btn-success');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก...'; }

    const { error } = await sb.from('lessons').update({
        course_name:  course,
        topic_name:   topic || 'ทั่วไป',
        lesson_title: title,
        vimeo_id:     videoId || null,
        order_no:     parseInt(orderNo) || 1,
        pdf_url:      pdfUrl || null,
    }).eq('id', id);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 บันทึก'; }

    if (error) { showMsg(msg,'บันทึกไม่สำเร็จ: '+error.message,'error'); return; }
    closeEditLessonModal();
    await loadLessonList();
}

// ==============================
// PREVIEW MODAL
// ==============================
function openPreviewModal(id) {
    const l = _lessonMap[id];
    if (!l) return;

    document.getElementById('preview-title').textContent = l.lesson_title;

    const tabs = document.getElementById('preview-tabs');
    const body = document.getElementById('preview-body');
    tabs.innerHTML = '';
    body.innerHTML = '';

    const hasVideo = !!l.vimeo_id;
    const pdfs     = l.pdf_url ? l.pdf_url.split(',').map(s => s.trim()).filter(Boolean) : [];

    if (!hasVideo && !pdfs.length) {
        body.innerHTML = '<div class="empty-state">ไม่มีเนื้อหาให้ดูตัวอย่าง</div>';
        document.getElementById('preview-modal').style.display = 'flex';
        return;
    }

    const sections = [];
    if (hasVideo)    sections.push({ label: '🎬 วิดีโอ', type: 'video', src: getVideoEmbedUrl(l.vimeo_id) });
    pdfs.forEach((url, i) => sections.push({ label: `📄 PDF${pdfs.length > 1 ? ' '+(i+1) : ''}`, type: 'pdf', src: getPdfEmbedUrl(url), rawUrl: url }));

    if (sections.length > 1) {
        tabs.innerHTML = sections.map((s, i) =>
            `<button class="preview-tab ${i===0?'active':''}" onclick="switchPreviewTab(${i})">${s.label}</button>`
        ).join('');
    }

    function renderSection(s) {
        if (s.type === 'video') {
            return `<iframe src="${s.src}" class="preview-iframe" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
        } else {
            return `
            <div style="text-align:right;margin-bottom:8px;">
                <a href="${s.rawUrl}" target="_blank" class="btn btn-ghost" style="width:auto;font-size:12px;padding:6px 14px;">เปิดในแท็บใหม่ ↗</a>
            </div>
            <iframe src="${s.src}" class="preview-iframe preview-pdf"></iframe>`;
        }
    }

    body.innerHTML = sections.map((s, i) =>
        `<div class="preview-section ${i===0?'active':''}" data-idx="${i}">${renderSection(s)}</div>`
    ).join('');

    document.getElementById('preview-modal').style.display = 'flex';
}

function switchPreviewTab(idx) {
    document.querySelectorAll('.preview-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
    document.querySelectorAll('.preview-section').forEach((s, i) => s.classList.toggle('active', i === idx));
}

function closePreviewModal() {
    document.getElementById('preview-modal').style.display = 'none';
    document.getElementById('preview-body').innerHTML = '';
}

function getVideoEmbedUrl(videoId) {
    if (!videoId) return null;
    if (/^\d+$/.test(videoId.trim())) {
        return `https://player.vimeo.com/video/${videoId.trim()}`;
    }
    return `https://www.youtube.com/embed/${videoId.trim()}`;
}

function getPdfEmbedUrl(url) {
    if (!url) return null;
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/?\s]+)/);
    if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
}

// ==============================
// DRAG & DROP — LESSONS
// ==============================
function attachDragListeners() {
    const container = document.getElementById('lesson-list');
    if (!container) return;

    container.querySelectorAll('.draggable').forEach(item => {
        item.addEventListener('dragstart', e => {
            _dragSrcId = parseInt(item.dataset.id);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (parseInt(item.dataset.id) !== _dragSrcId) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', async e => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const targetId = parseInt(item.dataset.id);
            if (!_dragSrcId || _dragSrcId === targetId) return;
            await reorderLessons(_dragSrcId, targetId);
            _dragSrcId = null;
        });
    });
}

async function reorderLessons(srcId, tgtId) {
    const srcIdx = _currentLessons.findIndex(l => l.id === srcId);
    const tgtIdx = _currentLessons.findIndex(l => l.id === tgtId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const newOrder = [..._currentLessons];
    const [moved]  = newOrder.splice(srcIdx, 1);
    newOrder.splice(tgtIdx, 0, moved);

    const updates = newOrder.map((l, i) => ({ id: l.id, order_no: i + 1 }));
    await Promise.all(updates.map(u => sb.from('lessons').update({ order_no: u.order_no }).eq('id', u.id)));
    await loadLessonList();
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
            <div class="list-item-info" style="cursor:pointer;" onclick='openStudentDetailModal(${JSON.stringify(s)})' title="ดูประวัติ">
                <div class="list-item-name">👤 ${s.name||'(ไม่ระบุชื่อ)'}</div>
                <div class="list-item-sub">${s.email}</div>
                ${s.note?`<div class="list-item-sub">${s.note}</div>`:''}
            </div>
            <span class="badge badge-blue">${s.course_name}</span>
            <button class="icon-btn" title="ดูประวัติ" onclick='openStudentDetailModal(${JSON.stringify(s)})'>👁</button>
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
    loadCharts();
}

async function deleteStudent(id) {
    const { error } = await sb.from('users_courses').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: '+error.message); return; }
    await Promise.all([loadStudentList(), loadRecentStudents(), loadStats()]);
    loadCharts();
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
// FINANCE — DAY PARSING (Smart Monthly)
// ==============================
const DAY_OFFSETS = {
    monday: 0, mon: 0,
    tuesday: 1, tue: 1,
    wednesday: 2, wed: 2,
    thursday: 3, thu: 3,
    friday: 4, fri: 4,
    saturday: 5, sat: 5,
    sunday: 6, sun: 6,
};

function parseDaysFromCourseName(courseName) {
    const parts = courseName.toLowerCase().split(/[_\-\s]+/);
    const found = [];
    for (const part of parts) {
        if (DAY_OFFSETS.hasOwnProperty(part) && !found.includes(DAY_OFFSETS[part])) {
            found.push(DAY_OFFSETS[part]);
        }
    }
    return found.sort((a, b) => a - b);
}

function attributeSessionFee(session) {
    // Returns array of { month: 'YYYY-MM', amount }
    const days = parseDaysFromCourseName(session.course_name);
    const fee  = session.fee || 0;

    if (days.length === 0) {
        // No day info → attribute full fee to week_start month
        return [{ month: session.week_start.substring(0, 7), amount: fee }];
    }

    const weekStart = new Date(session.week_start + 'T00:00:00');
    const perDay    = fee / days.length;

    return days.map(offset => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + offset);
        const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return { month, amount: perDay };
    });
}

// ==============================
// FINANCE — WEEK HELPERS
// ==============================
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
    const opts     = { day:'numeric', month:'long' };
    const optsFull = { day:'numeric', month:'long', year:'numeric' };
    const startStr = weekStart.toLocaleDateString('th-TH', opts);
    const endStr   = end.toLocaleDateString('th-TH', optsFull);
    return `${startStr} — ${endStr}`;
}

function isCurrentWeek(weekStart) {
    const now = getWeekStart(new Date()).toISOString().split('T')[0];
    return weekStart.toISOString().split('T')[0] === now;
}

function updateWeekBadge() {
    const badge   = document.getElementById('week-current-badge');
    const gotoBtn = document.getElementById('week-goto-btn');
    const isCurrent = isCurrentWeek(_currentWeekStart);
    if (badge)   badge.style.display   = isCurrent ? 'inline-block' : 'none';
    if (gotoBtn) gotoBtn.style.display = isCurrent ? 'none' : 'inline-block';
}

function changeWeek(dir) {
    _currentWeekStart = new Date(_currentWeekStart);
    _currentWeekStart.setDate(_currentWeekStart.getDate() + dir*7);
    updateWeekBadge();
    loadWeekSessions();
}

function goToCurrentWeek() {
    _currentWeekStart = getWeekStart(new Date());
    updateWeekBadge();
    loadWeekSessions();
}

async function initFinance() {
    updateWeekBadge();
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
    if (field === 'taught' && !value) update.paid = false;
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
// MONTHLY SUMMARY (Smart — แยกตามวันที่สอนจริง)
// ==============================
async function loadMonthlySummary() {
    const picker = document.getElementById('month-picker');
    if (!picker?.value) return;
    const [year, month] = picker.value.split('-').map(Number);
    const targetMonth   = `${year}-${String(month).padStart(2,'0')}`;

    // Fetch with buffer: 6 days before month start (catch weeks that started in prev month)
    const fetchFrom = new Date(year, month - 1, 1);
    fetchFrom.setDate(fetchFrom.getDate() - 6);
    const fetchTo   = new Date(year, month, 0); // last day of month

    const { data } = await sb.from('weekly_sessions')
        .select('*')
        .gte('week_start', fetchFrom.toISOString().split('T')[0])
        .lte('week_start', fetchTo.toISOString().split('T')[0])
        .order('week_start');

    const el = document.getElementById('month-summary');

    const byCourse = {};
    let grandTotal = 0, grandReceived = 0, grandSessions = 0;

    for (const session of (data || [])) {
        if (!session.taught) continue;

        const attrs     = attributeSessionFee(session);
        const relevant  = attrs.filter(a => a.month === targetMonth);
        if (!relevant.length) continue;

        const portion   = relevant.reduce((sum, a) => sum + a.amount, 0);
        const received  = session.paid ? portion : 0;

        if (!byCourse[session.course_name]) {
            byCourse[session.course_name] = { total: 0, received: 0, count: 0 };
        }
        byCourse[session.course_name].total    += portion;
        byCourse[session.course_name].received += received;
        byCourse[session.course_name].count    += 1;

        grandTotal    += portion;
        grandReceived += received;
        grandSessions += 1;
    }

    const grandPending = grandTotal - grandReceived;
    const courseNames  = Object.keys(byCourse).sort();

    if (!courseNames.length) {
        el.innerHTML = '<div class="month-empty">ไม่มีข้อมูลเดือนนี้</div>';
        return;
    }

    let html = `
    <div class="ms-top-row">
        <div class="ms-kpi">
            <span class="ms-kpi-val">฿${Math.round(grandTotal).toLocaleString()}</span>
            <span class="ms-kpi-label">รวมควรได้รับ</span>
        </div>
        <div class="ms-kpi success">
            <span class="ms-kpi-val">฿${Math.round(grandReceived).toLocaleString()}</span>
            <span class="ms-kpi-label">ได้รับแล้ว</span>
        </div>
        <div class="ms-kpi ${grandPending > 0 ? 'warn' : 'success'}">
            <span class="ms-kpi-val">฿${Math.round(grandPending).toLocaleString()}</span>
            <span class="ms-kpi-label">ค้างจ่าย</span>
        </div>
    </div>
    <div class="ms-taught-row">
        <span class="ms-taught-badge">สอนแล้ว ${grandSessions} ครั้ง (เฉพาะส่วนที่นับในเดือนนี้)</span>
    </div>
    <div class="ms-course-grid">`;

    courseNames.forEach(name => {
        const c   = byCourse[name];
        const pct = c.total > 0 ? Math.round((c.received / c.total) * 100) : 0;
        const isPaid = c.received >= c.total && c.total > 0;
        html += `
        <div class="ms-course-card ${isPaid ? 'ms-paid' : ''}">
            <div class="ms-course-header">
                <span class="ms-course-name">${name}</span>
                <span class="ms-course-sessions">${c.count} ครั้ง</span>
            </div>
            <div class="ms-progress-bar">
                <div class="ms-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="ms-course-amounts">
                <span class="ms-amt-received">฿${Math.round(c.received).toLocaleString()}</span>
                <span class="ms-amt-total">/ ฿${Math.round(c.total).toLocaleString()}</span>
            </div>
        </div>`;
    });

    html += `</div>`;
    el.innerHTML = html;
}

// ==============================
// CONFIRM MODAL
// ==============================
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

// ==============================
// FEATURE 1: UNPAID ALERT WIDGET
// ==============================
async function loadUnpaidAlert() {
    const weekStr = getWeekStart(new Date()).toISOString().split('T')[0];
    const { data } = await sb.from('weekly_sessions')
        .select('*')
        .eq('week_start', weekStr)
        .eq('taught', true)
        .eq('paid', false);

    const el = document.getElementById('unpaid-alert');
    const listEl = document.getElementById('unpaid-alert-list');
    if (!el || !listEl) return;

    if (!data?.length) {
        el.style.display = 'none';
        return;
    }

    document.getElementById('unpaid-alert-title').textContent =
        `สัปดาห์นี้ยังค้างจ่าย ${data.length} กลุ่ม`;

    listEl.innerHTML = data.map(s => `
        <div class="unpaid-item" id="unpaid-item-${s.id}">
            <div class="unpaid-item-info">
                <span class="unpaid-item-name">${s.course_name}</span>
                <span class="unpaid-item-fee">฿${(s.fee||0).toLocaleString()}</span>
            </div>
            <button class="btn-mark-paid" onclick="quickMarkPaid(${s.id})">✔ จ่ายแล้ว</button>
        </div>`).join('');

    el.style.display = 'block';
}

async function quickMarkPaid(sessionId) {
    const btn = document.querySelector(`#unpaid-item-${sessionId} .btn-mark-paid`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    const { error } = await sb.from('weekly_sessions').update({ paid: true }).eq('id', sessionId);
    if (error) { alert('อัปเดตไม่สำเร็จ: ' + error.message); return; }
    const item = document.getElementById(`unpaid-item-${sessionId}`);
    if (item) {
        item.classList.add('unpaid-item-done');
        item.innerHTML = `<span style="opacity:.5;font-size:13px;">✅ ${item.querySelector('.unpaid-item-name')?.textContent||''} — จ่ายแล้ว</span>`;
    }
    await Promise.all([loadStats(), loadWeekSessions()]);
    setTimeout(() => loadUnpaidAlert(), 800);
}

// ==============================
// FEATURE 2: GLOBAL SEARCH
// ==============================
let _searchTimer = null;

function openSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const input = document.getElementById('search-input');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('search-results').innerHTML =
        '<div class="search-empty-hint">พิมพ์เพื่อเริ่มค้นหา...</div>';
}

function closeSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) overlay.style.display = 'none';
}

function handleSearchOverlayBg(e) {
    if (e.target.id === 'search-overlay') closeSearchOverlay();
}

function runSearch() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(doSearch, 200);
}

async function doSearch() {
    const q = (document.getElementById('search-input')?.value || '').trim();
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    if (q.length < 2) {
        resultsEl.innerHTML = '<div class="search-empty-hint">พิมพ์อย่างน้อย 2 ตัวอักษร...</div>';
        return;
    }

    resultsEl.innerHTML = '<div class="search-empty-hint">กำลังค้นหา...</div>';

    const qLower = q.toLowerCase();
    const [studentsRes, lessonsRes] = await Promise.all([
        sb.from('users_courses').select('*').order('id', { ascending: false }).limit(200),
        sb.from('lessons').select('*').order('order_no').limit(300),
    ]);

    const students = (studentsRes.data || []).filter(s =>
        (s.name || '').toLowerCase().includes(qLower) ||
        (s.email || '').toLowerCase().includes(qLower)
    ).slice(0, 6);

    const lessons = (lessonsRes.data || []).filter(l =>
        (l.lesson_title || '').toLowerCase().includes(qLower) ||
        (l.topic_name || '').toLowerCase().includes(qLower) ||
        (l.course_name || '').toLowerCase().includes(qLower)
    ).slice(0, 6);

    const courses = _allCourses.filter(c =>
        c.name.toLowerCase().includes(qLower)
    ).slice(0, 4);

    if (!students.length && !lessons.length && !courses.length) {
        resultsEl.innerHTML = `<div class="search-empty-hint">ไม่พบผลลัพธ์สำหรับ "<strong>${q}</strong>"</div>`;
        return;
    }

    let html = '';

    if (courses.length) {
        html += `<div class="search-group-label">📚 คอร์ส</div>`;
        html += courses.map(c => `
            <div class="search-result-item" onclick="searchGoTo('courses','${c.name}')">
                <div class="sri-icon">📚</div>
                <div class="sri-body">
                    <div class="sri-title">${highlight(c.name, q)}</div>
                    <div class="sri-sub">คอร์สเรียน</div>
                </div>
            </div>`).join('');
    }

    if (students.length) {
        html += `<div class="search-group-label">👤 นักเรียน</div>`;
        html += students.map(s => `
            <div class="search-result-item" onclick='searchGoToStudent(${JSON.stringify(s)})'>
                <div class="sri-icon sri-avatar">${(s.name||s.email||'?')[0].toUpperCase()}</div>
                <div class="sri-body">
                    <div class="sri-title">${highlight(s.name || s.email, q)}</div>
                    <div class="sri-sub">${s.email} · <span class="badge badge-blue" style="font-size:10px;padding:1px 6px;">${s.course_name}</span></div>
                </div>
            </div>`).join('');
    }

    if (lessons.length) {
        html += `<div class="search-group-label">🎬 บทเรียน</div>`;
        html += lessons.map(l => `
            <div class="search-result-item" onclick="searchGoToLesson('${l.course_name}')">
                <div class="sri-icon">${l.vimeo_id ? '🎬' : '📄'}</div>
                <div class="sri-body">
                    <div class="sri-title">${highlight(l.lesson_title, q)}</div>
                    <div class="sri-sub">${l.course_name} · ${l.topic_name || '—'}</div>
                </div>
            </div>`).join('');
    }

    resultsEl.innerHTML = html;
}

function highlight(text, query) {
    if (!text || !query) return text || '';
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
}

function searchGoTo(tab, courseName) {
    closeSearchOverlay();
    switchTab(tab);
    if (courseName) {
        setTimeout(() => {
            const sel = document.getElementById('lesson-filter-course');
            if (sel) { sel.value = courseName; loadLessonList(); }
        }, 200);
    }
}

function searchGoToStudent(student) {
    closeSearchOverlay();
    switchTab('students');
    setTimeout(() => openStudentDetailModal(student), 300);
}

function searchGoToLesson(courseName) {
    closeSearchOverlay();
    switchTab('lessons');
    setTimeout(() => {
        const sel = document.getElementById('lesson-filter-course');
        if (sel) { sel.value = courseName; loadLessonList(); }
    }, 200);
}

// ==============================
// FEATURE 3: STUDENT DETAIL MODAL
// ==============================
async function openStudentDetailModal(student) {
    document.getElementById('detail-modal-title').textContent = student.name || student.email;
    document.getElementById('student-detail-body').innerHTML =
        '<div class="detail-loading">กำลังโหลด...</div>';
    document.getElementById('student-detail-modal').style.display = 'flex';

    const courseName = student.course_name;

    // Fetch last 16 weeks of sessions for this course
    const since = new Date();
    since.setDate(since.getDate() - 112);
    const { data: sessions } = await sb.from('weekly_sessions')
        .select('*')
        .eq('course_name', courseName)
        .gte('week_start', since.toISOString().split('T')[0])
        .order('week_start', { ascending: false });

    const all = sessions || [];
    const taught = all.filter(s => s.taught);
    const paid = taught.filter(s => s.paid);
    const totalExpected = taught.reduce((a, s) => a + (s.fee || 0), 0);
    const totalReceived = paid.reduce((a, s) => a + (s.fee || 0), 0);
    const totalPending = totalExpected - totalReceived;

    const initials = (student.name || student.email || '?')
        .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    let html = `
    <div class="detail-profile">
        <div class="detail-avatar">${initials}</div>
        <div class="detail-profile-info">
            <div class="detail-name">${student.name || '(ไม่ระบุชื่อ)'}</div>
            <div class="detail-email">${student.email}</div>
            <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <span class="badge badge-blue">${student.course_name}</span>
                ${student.note ? `<span class="detail-note">${student.note}</span>` : ''}
            </div>
        </div>
    </div>

    <div class="detail-stats">
        <div class="detail-stat">
            <span class="detail-stat-val">${taught.length}</span>
            <span class="detail-stat-lbl">ครั้งที่สอน</span>
        </div>
        <div class="detail-stat success">
            <span class="detail-stat-val">฿${totalReceived.toLocaleString()}</span>
            <span class="detail-stat-lbl">จ่ายแล้ว</span>
        </div>
        <div class="detail-stat ${totalPending > 0 ? 'danger' : ''}">
            <span class="detail-stat-val">฿${totalPending.toLocaleString()}</span>
            <span class="detail-stat-lbl">ค้างจ่าย</span>
        </div>
    </div>`;

    if (all.length) {
        html += `<div class="detail-section-title">ประวัติ 16 สัปดาห์ล่าสุด</div>
        <div class="detail-history">`;

        all.forEach(s => {
            const d = new Date(s.week_start);
            const label = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
            const statusCls = s.paid ? 'hist-paid' : s.taught ? 'hist-taught' : 'hist-absent';
            const statusTxt = s.paid ? '✅ จ่ายแล้ว' : s.taught ? '⏳ ค้างจ่าย' : '○ ไม่ได้สอน';
            html += `
            <div class="hist-row ${statusCls}">
                <span class="hist-date">${label}</span>
                <span class="hist-status">${statusTxt}</span>
                <span class="hist-fee">${s.taught ? '฿'+(s.fee||0).toLocaleString() : '—'}</span>
            </div>`;
        });

        html += `</div>`;
    } else {
        html += `<div class="detail-empty">ยังไม่มีประวัติสัปดาห์สำหรับคอร์สนี้</div>`;
    }

    html += `<div class="modal-actions" style="margin-top:20px;">
        <button class="btn btn-ghost" onclick="closeStudentDetailModal()">ปิด</button>
        <button class="btn btn-primary" onclick='closeStudentDetailModal();openEditStudentModal(${JSON.stringify(student)})'>✏️ แก้ไขข้อมูล</button>
    </div>`;

    document.getElementById('student-detail-body').innerHTML = html;
}

function closeStudentDetailModal() {
    document.getElementById('student-detail-modal').style.display = 'none';
}

function handleDetailOverlayBg(e) {
    if (e.target.id === 'student-detail-modal') closeStudentDetailModal();
}

// ==============================
// FEATURE 4: DUPLICATE COURSE
// ==============================
let _dupCourseId = null;
let _dupCourseName = '';

function openDuplicateCourse(courseId, courseName) {
    _dupCourseId   = courseId;
    _dupCourseName = courseName;
    document.getElementById('dup-source-label').textContent = `คัดลอกจากคอร์ส: ${courseName}`;
    document.getElementById('dup-new-name').value = courseName + '_copy';
    document.getElementById('dup-copy-lessons').checked = true;
    document.getElementById('dup-msg').textContent = '';
    document.getElementById('dup-confirm-btn').disabled = false;
    document.getElementById('dup-confirm-btn').textContent = '📋 ก็อปปี้';
    document.getElementById('duplicate-modal').style.display = 'flex';
    setTimeout(() => {
        const inp = document.getElementById('dup-new-name');
        if (inp) { inp.focus(); inp.select(); }
    }, 150);
}

function closeDuplicateModal() {
    document.getElementById('duplicate-modal').style.display = 'none';
}

async function confirmDuplicate() {
    const newName = document.getElementById('dup-new-name').value.trim();
    const copyLessons = document.getElementById('dup-copy-lessons').checked;
    const msg = document.getElementById('dup-msg');
    const btn = document.getElementById('dup-confirm-btn');

    if (!newName) { showMsg(msg, 'กรุณากรอกชื่อคอร์สใหม่', 'error'); return; }
    if (newName === _dupCourseName) { showMsg(msg, 'กรุณาใช้ชื่อที่ต่างจากเดิม', 'error'); return; }

    const { data: existing } = await sb.from('courses').select('id').eq('name', newName).limit(1);
    if (existing?.length) { showMsg(msg, `มีคอร์สชื่อ "${newName}" อยู่แล้ว`, 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'กำลังก็อปปี้...';

    const { error: courseErr } = await sb.from('courses').insert([{ name: newName }]);
    if (courseErr) {
        btn.disabled = false; btn.textContent = '📋 ก็อปปี้';
        showMsg(msg, 'สร้างคอร์สไม่สำเร็จ: ' + courseErr.message, 'error');
        return;
    }

    if (copyLessons) {
        const { data: srcLessons } = await sb.from('lessons')
            .select('*')
            .eq('course_name', _dupCourseName)
            .order('order_no');

        if (srcLessons?.length) {
            const toInsert = srcLessons.map(l => ({
                course_name:  newName,
                topic_name:   l.topic_name,
                lesson_title: l.lesson_title,
                vimeo_id:     l.vimeo_id,
                order_no:     l.order_no,
                pdf_url:      l.pdf_url,
            }));
            const { error: lessonErr } = await sb.from('lessons').insert(toInsert);
            if (lessonErr) {
                showMsg(msg, `คอร์สสร้างแล้ว แต่คัดลอกบทเรียนไม่สำเร็จ: ${lessonErr.message}`, 'error');
                btn.disabled = false; btn.textContent = '📋 ก็อปปี้';
                await Promise.all([loadCourseList(), loadCourseDropdowns()]);
                return;
            }
        }
    }

    closeDuplicateModal();
    showMsg(document.getElementById('course-msg'),
        `✅ ก็อปปี้คอร์ส "${newName}" สำเร็จ${copyLessons ? ' พร้อมบทเรียนทั้งหมด' : ''}`, 'success');
    await Promise.all([loadCourseList(), loadCourseDropdowns(), loadStats(), loadLessonList(), loadFeeSettings()]);
}

// ==============================
// FEATURE 5: FINANCE CALENDAR VIEW
// ==============================
function switchFinanceView(view) {
    const weekView = document.getElementById('finance-week-view');
    const calView  = document.getElementById('finance-calendar-view');
    const btnWeek  = document.getElementById('view-btn-week');
    const btnCal   = document.getElementById('view-btn-calendar');

    if (view === 'calendar') {
        weekView.style.display = 'none';
        calView.style.display  = 'block';
        btnWeek.classList.remove('active');
        btnCal.classList.add('active');
        loadCalendarView();
    } else {
        weekView.style.display = 'block';
        calView.style.display  = 'none';
        btnWeek.classList.add('active');
        btnCal.classList.remove('active');
    }
}

async function loadCalendarView() {
    const wrap = document.getElementById('finance-calendar');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:20px;color:var(--text-muted);">กำลังโหลด...</div>';

    // Build list of last 10 week starts
    const today = getWeekStart(new Date());
    const weeks = [];
    for (let i = 9; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i * 7);
        weeks.push(d.toISOString().split('T')[0]);
    }

    const { data: sessions } = await sb.from('weekly_sessions')
        .select('*')
        .gte('week_start', weeks[0])
        .lte('week_start', weeks[weeks.length - 1])
        .order('week_start');

    if (!_allCourses.length) {
        await loadCourseDropdowns();
    }
    if (!_allCourses.length) {
        wrap.innerHTML = '<div style="padding:20px;color:var(--text-muted);">ยังไม่มีคอร์ส</div>';
        return;
    }

    // Build lookup: weekStr -> courseName -> session
    const lookup = {};
    (sessions || []).forEach(s => {
        if (!lookup[s.week_start]) lookup[s.week_start] = {};
        lookup[s.week_start][s.course_name] = s;
    });

    const courseNames = _allCourses.map(c => c.name);

    // Header row: week labels
    let html = '<div class="cal-table"><div class="cal-row cal-head"><div class="cal-cell cal-course-header">คอร์ส</div>';
    weeks.forEach(w => {
        const d = new Date(w + 'T00:00:00');
        const label = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        const isCurrentWeek = w === today.toISOString().split('T')[0];
        html += `<div class="cal-cell cal-week-header ${isCurrentWeek ? 'cal-current-week' : ''}">${label}${isCurrentWeek ? '<br><span class="cal-now-badge">นี้</span>' : ''}</div>`;
    });
    html += '</div>';

    // Course rows
    courseNames.forEach(cn => {
        html += `<div class="cal-row"><div class="cal-cell cal-course-label">${cn}</div>`;
        weeks.forEach(w => {
            const s = lookup[w]?.[cn];
            if (!s) {
                html += `<div class="cal-cell cal-cell-empty" onclick="jumpToWeek('${w}')">—</div>`;
            } else if (s.paid) {
                html += `<div class="cal-cell cal-cell-paid" onclick="jumpToWeek('${w}')" title="จ่ายแล้ว ฿${(s.fee||0).toLocaleString()}">฿${(s.fee||0).toLocaleString()}<br><span class="cal-status-txt">✅</span></div>`;
            } else if (s.taught) {
                html += `<div class="cal-cell cal-cell-taught" onclick="jumpToWeek('${w}')" title="สอนแล้ว ยังไม่จ่าย ฿${(s.fee||0).toLocaleString()}">฿${(s.fee||0).toLocaleString()}<br><span class="cal-status-txt">⏳</span></div>`;
            } else {
                html += `<div class="cal-cell cal-cell-absent" onclick="jumpToWeek('${w}')" title="ไม่ได้สอน">○</div>`;
            }
        });
        html += '</div>';
    });

    html += '</div>';
    wrap.innerHTML = html;
}

function jumpToWeek(weekStr) {
    const d = new Date(weekStr + 'T00:00:00');
    _currentWeekStart = d;
    switchFinanceView('week');
    loadWeekSessions();
}
