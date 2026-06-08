// ============================================================
// students.js — จัดการนักเรียน + การลงทะเบียนคอร์ส (Enrollment)
// ใช้ตาราง: users, enrollments, courses
// ============================================================

// ---- โหลดรายชื่อนักเรียน ----
async function loadStudentList() {
    const courseFilter = document.getElementById('stu-filter-course')?.value;
    const searchVal    = document.getElementById('stu-search')?.value.trim().toLowerCase();
    const el           = document.getElementById('student-list');
    if (!el) return;

    el.innerHTML = '<div class="loading-state">กำลังโหลด...</div>';

    // ถ้ากรองตามคอร์ส ต้อง join enrollments
    let users;
    if (courseFilter) {
        const { data: enrolled } = await sb
            .from('enrollments')
            .select('user_id')
            .eq('course_code', courseFilter);
        const ids = [...new Set((enrolled || []).map(e => e.user_id))];
        if (!ids.length) { el.innerHTML = '<div class="empty-state">ไม่มีนักเรียนในคอร์สนี้</div>'; return; }
        const { data } = await sb.from('users').select('*').in('id', ids).order('created_at', { ascending: false });
        users = data;
    } else {
        const { data } = await sb.from('users').select('*').order('created_at', { ascending: false });
        users = data;
    }

    if (!users?.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีนักเรียน</div>'; return; }

    // กรองด้วยคำค้นหา
    const filtered = searchVal
        ? users.filter(s =>
            (s.name  || '').toLowerCase().includes(searchVal) ||
            (s.email || '').toLowerCase().includes(searchVal) ||
            (s.phone || '').toLowerCase().includes(searchVal))
        : users;

    if (!filtered.length) { el.innerHTML = '<div class="empty-state">ไม่พบนักเรียนที่ค้นหา</div>'; return; }

    el.innerHTML = filtered.map(s => `
        <div class="list-item">
            <div class="list-item-info" style="cursor:pointer;"
                onclick='openStudentDetailModal(${JSON.stringify(s)})' title="ดูรายละเอียด">
                <div class="list-item-name">👤 ${escHtml(s.name || '(ไม่ระบุชื่อ)')}</div>
                <div class="list-item-sub">
                    ${s.email ? `<span class="mono-text">${escHtml(s.email)}</span>` : ''}
                    ${s.phone ? ` · 📱 ${escHtml(s.phone)}` : ''}
                    ${s.level ? ` · <span class="badge badge-purple">${escHtml(s.level)}</span>` : ''}
                </div>
            </div>
            <div class="list-item-actions">
                <button class="btn btn-sm btn-secondary" onclick='openEnrollModal(${s.id}, "${escHtml(s.name || s.email || '')}")'>
                    📋 คอร์ส
                </button>
                <button class="icon-btn edit" title="แก้ไข"
                    onclick='openEditStudentModal(${JSON.stringify(s)})'>✏️</button>
                <button class="icon-btn delete" title="ลบ"
                    onclick="confirmDelete('ลบนักเรียน <b>${escHtml(s.name || s.email || '')}</b>?', () => deleteStudent(${s.id}))">🗑</button>
            </div>
        </div>`).join('');
}

// ---- เพิ่มนักเรียน ----
async function addStudent() {
    const msg      = document.getElementById('student-msg');
    const name     = document.getElementById('stu-name')?.value.trim();
    const email    = document.getElementById('stu-email')?.value.trim();
    const phone    = document.getElementById('stu-phone')?.value.trim();
    const level    = document.getElementById('stu-level')?.value.trim();

    if (!phone) { showMsg(msg, 'กรุณากรอกเบอร์โทรศัพท์ (ใช้เข้าระบบ)', 'error'); return; }

    const { error } = await sb.from('users').insert([{
        name:  name  || null,
        email: email || null,
        phone: phone,
        level: level || null,
    }]);

    if (error) { showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }
    showMsg(msg, `✅ เพิ่มนักเรียน "${name || phone}" สำเร็จ`, 'success');
    ['stu-name','stu-email','stu-phone','stu-level'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    await Promise.all([loadStudentList(), loadRecentStudents()]);
}

async function deleteStudent(id) {
    // ลบ enrollments ที่เชื่อมโยงก่อน
    await sb.from('enrollments').delete().eq('user_id', id);
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await Promise.all([loadStudentList(), loadRecentStudents()]);
}

// ---- Edit Student Modal ----
function openEditStudentModal(student) {
    document.getElementById('edit-stu-id').value    = student.id;
    document.getElementById('edit-stu-name').value  = student.name  || '';
    document.getElementById('edit-stu-email').value = student.email || '';
    document.getElementById('edit-stu-phone').value = student.phone || '';
    document.getElementById('edit-stu-level').value = student.level || '';
    document.getElementById('edit-stu-msg').textContent = '';
    document.getElementById('edit-student-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('edit-stu-name')?.focus(), 150);
}

function closeEditStudentModal() {
    document.getElementById('edit-student-modal').style.display = 'none';
}

async function saveStudentModal() {
    const id    = document.getElementById('edit-stu-id')?.value;
    const name  = document.getElementById('edit-stu-name')?.value.trim();
    const email = document.getElementById('edit-stu-email')?.value.trim();
    const phone = document.getElementById('edit-stu-phone')?.value.trim();
    const level = document.getElementById('edit-stu-level')?.value.trim();
    const msg   = document.getElementById('edit-stu-msg');

    if (!phone) { showMsg(msg, 'กรุณากรอกเบอร์โทรศัพท์', 'error'); return; }

    const saveBtn = document.querySelector('#edit-student-modal .btn-success');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก...'; }

    const { error } = await sb.from('users').update({
        name:  name  || null,
        email: email || null,
        phone: phone,
        level: level || null,
    }).eq('id', id);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 บันทึก'; }
    if (error) { showMsg(msg, 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    closeEditStudentModal();
    await Promise.all([loadStudentList(), loadRecentStudents()]);
}

// ---- Student Detail Modal ----
async function openStudentDetailModal(student) {
    document.getElementById('student-detail-modal').style.display = 'flex';
    document.getElementById('detail-modal-title').textContent = student.name || student.phone || 'นักเรียน';
    const body = document.getElementById('student-detail-body');
    body.innerHTML = '<div class="loading-state">กำลังโหลด...</div>';

    // โหลด enrollments พร้อม course info
    const { data: enrollments } = await sb
        .from('enrollments')
        .select('id, course_code, enrolled_at, expires_at, note, sort_order')
        .eq('user_id', student.id)
        .order('sort_order', { ascending: true });

    // โหลด lesson_progress
    const { data: progress } = await sb
        .from('lesson_progress')
        .select('lesson_id, course_code, watched_at')
        .eq('user_id', student.id)
        .order('watched_at', { ascending: false })
        .limit(20);

    let html = `
        <div class="detail-info-grid">
            <div class="detail-info-row"><span class="detail-label">ชื่อ</span><span>${escHtml(student.name || '—')}</span></div>
            <div class="detail-info-row"><span class="detail-label">อีเมล</span><span class="mono-text">${escHtml(student.email || '—')}</span></div>
            <div class="detail-info-row"><span class="detail-label">เบอร์โทร</span><span class="mono-text">${escHtml(student.phone || '—')}</span></div>
            <div class="detail-info-row"><span class="detail-label">ระดับ</span><span>${student.level ? `<span class="badge badge-purple">${escHtml(student.level)}</span>` : '—'}</span></div>
            <div class="detail-info-row"><span class="detail-label">เพิ่มเมื่อ</span><span>${formatDateShort(student.created_at)}</span></div>
        </div>
        <h4 style="margin: 16px 0 8px; color:var(--text-dim);">📋 คอร์สที่ลงทะเบียน (${(enrollments||[]).length} คอร์ส)</h4>`;

    if (enrollments?.length) {
        html += `<div class="enrollment-list">` + enrollments.map(e => `
            <div class="enrollment-item">
                <div class="enrollment-info">
                    <span class="mono-text badge-code">${escHtml(e.course_code)}</span>
                    <span class="text-muted" style="font-size:12px;">ลงทะเบียน ${formatDateShort(e.enrolled_at)}</span>
                    ${e.expires_at ? `<span class="text-muted" style="font-size:12px;">· หมดอายุ ${formatDateShort(e.expires_at)}</span>` : ''}
                    ${e.note ? `<span class="text-muted" style="font-size:12px;">· ${escHtml(e.note)}</span>` : ''}
                </div>
                <button class="icon-btn delete" title="ยกเลิกการลงทะเบียน"
                    onclick="unenrollStudent(${e.id}, ${student.id})">🗑</button>
            </div>`).join('') + `</div>`;
    } else {
        html += `<div class="detail-empty">ยังไม่ได้ลงทะเบียนคอร์สใด</div>`;
    }

    if (progress?.length) {
        html += `<h4 style="margin: 16px 0 8px; color:var(--text-dim);">🎬 บทเรียนที่ดูล่าสุด</h4>
        <div class="progress-list">` + progress.map(p => `
            <div class="progress-item">
                <span class="mono-text" style="font-size:12px;">${escHtml(p.course_code)}</span>
                <span class="text-muted" style="font-size:12px;">lesson #${p.lesson_id}</span>
                <span class="text-muted" style="font-size:12px;">${formatDateShort(p.watched_at)}</span>
            </div>`).join('') + `</div>`;
    }

    html += `<div class="modal-actions" style="margin-top:20px;">
        <button class="btn btn-ghost" onclick="closeStudentDetailModal()">ปิด</button>
        <button class="btn btn-primary" onclick='closeStudentDetailModal(); openEnrollModal(${student.id}, "${escHtml(student.name || student.phone || '')}")'>
            ➕ ลงทะเบียนคอร์ส
        </button>
        <button class="btn btn-secondary" onclick='closeStudentDetailModal(); openEditStudentModal(${JSON.stringify(student)})'>
            ✏️ แก้ไข
        </button>
    </div>`;

    body.innerHTML = html;
}

function closeStudentDetailModal() {
    document.getElementById('student-detail-modal').style.display = 'none';
}

// ---- Enrollment Modal ----
let _enrollUserId   = null;
let _enrollUserName = '';

async function openEnrollModal(userId, userName) {
    _enrollUserId   = userId;
    _enrollUserName = userName;
    document.getElementById('enroll-modal-title').textContent = `ลงทะเบียนคอร์สให้ ${userName}`;
    document.getElementById('enroll-expires').value = '';
    document.getElementById('enroll-note').value    = '';
    document.getElementById('enroll-msg').textContent = '';

    // โหลดคอร์ส
    if (!window._allCourses?.length) await loadCourseDropdowns();

    // โหลด enrollments ปัจจุบัน
    const { data: existing } = await sb
        .from('enrollments')
        .select('course_code')
        .eq('user_id', userId);
    const enrolledCodes = new Set((existing || []).map(e => e.course_code));

    const sel = document.getElementById('enroll-course-select');
    if (sel) {
        sel.innerHTML = '<option value="">-- เลือกคอร์ส --</option>'
            + (window._allCourses || []).map(c =>
                `<option value="${c.course_code}" ${enrolledCodes.has(c.course_code) ? 'disabled' : ''}>
                    ${escHtml(c.name)} (${c.course_code})
                    ${enrolledCodes.has(c.course_code) ? ' — ลงทะเบียนแล้ว' : ''}
                </option>`
            ).join('');
    }

    document.getElementById('enroll-modal').style.display = 'flex';
}

function closeEnrollModal() {
    document.getElementById('enroll-modal').style.display = 'none';
    _enrollUserId = null;
}

async function confirmEnroll() {
    const msg        = document.getElementById('enroll-msg');
    const courseCode = document.getElementById('enroll-course-select')?.value;
    const expires    = document.getElementById('enroll-expires')?.value;
    const note       = document.getElementById('enroll-note')?.value.trim();

    if (!courseCode) { showMsg(msg, 'กรุณาเลือกคอร์ส', 'error'); return; }

    const { error } = await sb.from('enrollments').insert([{
        user_id:     _enrollUserId,
        course_code: courseCode,
        expires_at:  expires || null,
        note:        note    || null,
        sort_order:  100,
    }]);

    if (error) { showMsg(msg, 'ลงทะเบียนไม่สำเร็จ: ' + error.message, 'error'); return; }
    showMsg(msg, '✅ ลงทะเบียนสำเร็จ', 'success');
    setTimeout(() => closeEnrollModal(), 1000);
    await loadStudentList();
}

async function unenrollStudent(enrollmentId, userId) {
    if (!confirm('ยืนยันการยกเลิกคอร์สนี้?')) return;
    const { error } = await sb.from('enrollments').delete().eq('id', enrollmentId);
    if (error) { alert('ยกเลิกไม่สำเร็จ: ' + error.message); return; }
    // reload detail modal
    const { data: student } = await sb.from('users').select('*').eq('id', userId).single();
    if (student) await openStudentDetailModal(student);
}