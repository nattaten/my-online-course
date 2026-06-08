// ============================================================
// courses.js — จัดการคอร์สเรียน (CRUD + Toggle is_active)
// ใช้ตาราง: courses
// ============================================================

// ---- โหลดรายชื่อคอร์ส ----
async function loadCourseList() {
    const { data, error } = await sb
        .from('courses')
        .select('*')
        .order('id', { ascending: true });

    const el = document.getElementById('course-list');
    if (!el) return;

    if (error) { el.innerHTML = `<div class="error-state">โหลดข้อมูลไม่สำเร็จ: ${error.message}</div>`; return; }
    if (!data?.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีคอร์ส</div>'; return; }

    // เก็บข้อมูลทั่วกลางเพื่อใช้ในโมดูลอื่น
    window._allCourses = data;

    el.innerHTML = data.map(c => {
        const prefixBadge = c.course_code?.startsWith('ol_')
            ? `<span class="badge badge-orange">สอนสด</span>`
            : c.course_code?.startsWith('vd_')
            ? `<span class="badge badge-blue">วิดีโอ</span>`
            : `<span class="badge badge-gray">—</span>`;

        const statusBadge = c.is_active
            ? `<span class="badge badge-green">เปิด</span>`
            : `<span class="badge badge-red">ปิด</span>`;

        return `
        <div class="list-item ${c.is_active ? '' : 'item-inactive'}">
            <div class="list-item-info">
                <div class="list-item-name">
                    ${prefixBadge}
                    ${escHtml(c.name)}
                </div>
                <div class="list-item-sub mono-text">
                    ${escHtml(c.course_code)} · ฿${(c.price || 0).toLocaleString()}
                    ${c.schedule_day ? ` · ${escHtml(c.schedule_day)} ${escHtml(c.schedule_time || '')}` : ''}
                </div>
            </div>
            <div class="list-item-actions">
                ${statusBadge}
                <button class="icon-btn" title="${c.is_active ? 'ปิดคอร์ส' : 'เปิดคอร์ส'}"
                    onclick="toggleCourseStatus(${c.id}, ${!c.is_active})">
                    ${c.is_active ? '🟢' : '🔴'}
                </button>
                <button class="icon-btn edit" title="แก้ไข"
                    onclick='openEditCourseModal(${JSON.stringify(c)})'>✏️</button>
                <button class="icon-btn delete" title="ลบ"
                    onclick="confirmDelete('ลบคอร์ส <b>${escHtml(c.name)}</b>?', () => deleteCourse(${c.id}))">🗑</button>
            </div>
        </div>`;
    }).join('');
}

// ---- เพิ่มคอร์สใหม่ ----
async function addCourse() {
    const msg        = document.getElementById('course-msg');
    const nameVal    = document.getElementById('new-course-name')?.value.trim();
    const codeVal    = document.getElementById('new-course-code')?.value.trim();
    const priceVal   = parseInt(document.getElementById('new-course-price')?.value) || 0;
    const subjectVal = document.getElementById('new-course-subject')?.value.trim();
    const dayVal     = document.getElementById('new-course-day')?.value.trim();
    const timeVal    = document.getElementById('new-course-time')?.value.trim();

    if (!nameVal || !codeVal) {
        showMsg(msg, 'กรุณากรอกชื่อคอร์สและรหัสคอร์ส', 'error'); return;
    }

    // ตรวจ duplicate
    const { data: exists } = await sb
        .from('courses').select('id').eq('course_code', codeVal).limit(1);
    if (exists?.length) { showMsg(msg, `รหัสคอร์ส "${codeVal}" มีอยู่แล้ว`, 'error'); return; }

    const { error } = await sb.from('courses').insert([{
        name:          nameVal,
        course_code:   codeVal,
        price:         priceVal,
        subject:       subjectVal || null,
        schedule_day:  dayVal     || null,
        schedule_time: timeVal    || null,
        is_active:     true,
    }]);

    if (error) { showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }

    showMsg(msg, `✅ เพิ่มคอร์ส "${nameVal}" สำเร็จ`, 'success');
    ['new-course-name','new-course-code','new-course-price','new-course-subject','new-course-day','new-course-time']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    await Promise.all([loadCourseList(), loadCourseDropdowns()]);
}

// ---- แก้ไขคอร์ส ----
let _editCourseId = null;

function openEditCourseModal(course) {
    _editCourseId = course.id;
    document.getElementById('edit-course-name').value    = course.name        || '';
    document.getElementById('edit-course-code').value    = course.course_code || '';
    document.getElementById('edit-course-price').value   = course.price       || 0;
    document.getElementById('edit-course-subject').value = course.subject     || '';
    document.getElementById('edit-course-day').value     = course.schedule_day  || '';
    document.getElementById('edit-course-time').value    = course.schedule_time || '';
    document.getElementById('edit-course-msg').textContent = '';
    document.getElementById('edit-course-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('edit-course-name')?.focus(), 150);
}

function closeEditCourseModal() {
    document.getElementById('edit-course-modal').style.display = 'none';
    _editCourseId = null;
}

async function saveEditCourse() {
    const msg = document.getElementById('edit-course-msg');
    const nameVal  = document.getElementById('edit-course-name')?.value.trim();
    const codeVal  = document.getElementById('edit-course-code')?.value.trim();
    const priceVal = parseInt(document.getElementById('edit-course-price')?.value) || 0;

    if (!nameVal || !codeVal) { showMsg(msg, 'กรุณากรอกให้ครบ', 'error'); return; }

    const saveBtn = document.querySelector('#edit-course-modal .btn-success');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก...'; }

    const { error } = await sb.from('courses').update({
        name:          nameVal,
        course_code:   codeVal,
        price:         priceVal,
        subject:       document.getElementById('edit-course-subject')?.value.trim() || null,
        schedule_day:  document.getElementById('edit-course-day')?.value.trim()     || null,
        schedule_time: document.getElementById('edit-course-time')?.value.trim()    || null,
    }).eq('id', _editCourseId);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 บันทึก'; }

    if (error) { showMsg(msg, 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    closeEditCourseModal();
    await Promise.all([loadCourseList(), loadCourseDropdowns()]);
}

// ---- Toggle สถานะ is_active ----
async function toggleCourseStatus(id, newStatus) {
    const { error } = await sb.from('courses').update({ is_active: newStatus }).eq('id', id);
    if (error) { alert('อัปเดตสถานะไม่สำเร็จ: ' + error.message); return; }
    await loadCourseList();
}

// ---- ลบคอร์ส ----
async function deleteCourse(id) {
    const { error } = await sb.from('courses').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await Promise.all([loadCourseList(), loadCourseDropdowns()]);
}

// ---- โหลด Dropdowns (ใช้ร่วมกับโมดูลอื่น) ----
async function loadCourseDropdowns() {
    const { data } = await sb.from('courses').select('id, course_code, name').order('id');
    window._allCourses = data || [];

    const opts       = '<option value="">-- เลือกคอร์ส --</option>'
                     + (data || []).map(c => `<option value="${c.course_code}">${c.name} (${c.course_code})</option>`).join('');
    const filterOpts = '<option value="">— ทุกคอร์ส —</option>'
                     + (data || []).map(c => `<option value="${c.course_code}">${c.name} (${c.course_code})</option>`).join('');

    ['lesson-course-select', 'enroll-course-select'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerHTML = opts;
    });
    ['lesson-filter-course', 'stu-filter-course'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerHTML = filterOpts;
    });
}