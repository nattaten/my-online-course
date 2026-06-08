// ============================================================
// lessons.js — จัดการบทเรียน (Filter by course + CRUD + Drag Sort)
// ใช้ตาราง: lessons, courses
// ============================================================

let _currentLessons = [];
let _dragSrcId = null;

// ---- โหลดรายชื่อบทเรียน ----
async function loadLessonList() {
    const courseCode = document.getElementById('lesson-filter-course')?.value;
    const el = document.getElementById('lesson-list');
    if (!el) return;

    el.innerHTML = '<div class="loading-state">กำลังโหลด...</div>';

    let query = sb.from('lessons').select('*').order('order_no', { ascending: true });
    if (courseCode) query = query.eq('course_code', courseCode);

    const { data, error } = await query;

    if (error) { el.innerHTML = `<div class="error-state">โหลดไม่สำเร็จ: ${error.message}</div>`; return; }
    if (!data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีบทเรียน' + (courseCode ? `ในคอร์สนี้` : '') + '</div>';
        return;
    }

    _currentLessons = data;

    el.innerHTML = data.map(l => `
        <div class="list-item draggable" data-id="${l.id}" draggable="true">
            <span class="drag-handle" title="ลากเพื่อเรียงลำดับ">⣿</span>
            <div class="list-item-info">
                <div class="list-item-name">
                    <span class="badge badge-gray mono-text">#${l.order_no}</span>
                    ${escHtml(l.lesson_title || '(ไม่มีชื่อ)')}
                </div>
                <div class="list-item-sub">
                    ${l.topic_name ? `📌 ${escHtml(l.topic_name)} · ` : ''}
                    <span class="mono-text">${escHtml(l.course_code)}</span>
                    ${l.youtube_url ? ` · 🎬 YouTube` : ''}
                    ${l.pdf_url     ? ` · 📄 PDF` : ''}
                </div>
            </div>
            <div class="list-item-actions">
                <button class="icon-btn edit" title="แก้ไข"
                    onclick='openEditLessonModal(${JSON.stringify(l)})'>✏️</button>
                <button class="icon-btn delete" title="ลบ"
                    onclick="confirmDelete('ลบบทเรียน <b>${escHtml(l.lesson_title || '')}</b>?', () => deleteLesson(${l.id}))">🗑</button>
            </div>
        </div>`).join('');

    attachLessonDragListeners();
}

// ---- เพิ่มบทเรียน ----
async function addLesson() {
    const msg       = document.getElementById('lesson-msg');
    const courseCode = document.getElementById('lesson-course-select')?.value;
    const title     = document.getElementById('lesson-title')?.value.trim();
    const topic     = document.getElementById('topic-name')?.value.trim();
    const ytUrl     = document.getElementById('youtube-url')?.value.trim();
    const pdfUrl    = document.getElementById('pdf-url')?.value.trim();
    const orderNo   = parseInt(document.getElementById('lesson-order')?.value) || 0;

    if (!courseCode || !title) {
        showMsg(msg, 'กรุณาเลือกคอร์สและกรอกชื่อบทเรียน', 'error'); return;
    }

    const { error } = await sb.from('lessons').insert([{
        course_code:  courseCode,
        lesson_title: title,
        topic_name:   topic     || null,
        youtube_url:  ytUrl     || null,
        pdf_url:      pdfUrl    || null,
        order_no:     orderNo,
    }]);

    if (error) { showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }

    showMsg(msg, `✅ เพิ่มบทเรียน "${title}" สำเร็จ`, 'success');
    ['lesson-title', 'topic-name', 'youtube-url', 'pdf-url', 'lesson-order']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    // sync filter dropdown กับคอร์สที่เพิ่ง add
    const filterEl = document.getElementById('lesson-filter-course');
    if (filterEl && !filterEl.value) filterEl.value = courseCode;

    await loadLessonList();
}

// ---- แก้ไขบทเรียน ----
function openEditLessonModal(lesson) {
    document.getElementById('edit-lesson-id').value      = lesson.id;
    document.getElementById('edit-lesson-title').value   = lesson.lesson_title || '';
    document.getElementById('edit-lesson-topic').value   = lesson.topic_name   || '';
    document.getElementById('edit-lesson-yturl').value   = lesson.youtube_url  || '';
    document.getElementById('edit-lesson-pdf').value     = lesson.pdf_url      || '';
    document.getElementById('edit-lesson-order').value   = lesson.order_no     || 0;
    document.getElementById('edit-lesson-msg').textContent = '';

    // ตั้งค่า dropdown คอร์ส
    const sel = document.getElementById('edit-lesson-course');
    if (sel && window._allCourses?.length) {
        sel.innerHTML = window._allCourses.map(c =>
            `<option value="${c.course_code}" ${c.course_code === lesson.course_code ? 'selected' : ''}>${c.name} (${c.course_code})</option>`
        ).join('');
    }

    document.getElementById('edit-lesson-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('edit-lesson-title')?.focus(), 150);
}

function closeEditLessonModal() {
    document.getElementById('edit-lesson-modal').style.display = 'none';
}

async function saveEditLesson() {
    const msg     = document.getElementById('edit-lesson-msg');
    const id      = document.getElementById('edit-lesson-id')?.value;
    const title   = document.getElementById('edit-lesson-title')?.value.trim();
    const course  = document.getElementById('edit-lesson-course')?.value;
    const topic   = document.getElementById('edit-lesson-topic')?.value.trim();
    const ytUrl   = document.getElementById('edit-lesson-yturl')?.value.trim();
    const pdfUrl  = document.getElementById('edit-lesson-pdf')?.value.trim();
    const order   = parseInt(document.getElementById('edit-lesson-order')?.value) || 0;

    if (!title) { showMsg(msg, 'กรุณากรอกชื่อบทเรียน', 'error'); return; }

    const saveBtn = document.querySelector('#edit-lesson-modal .btn-success');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก...'; }

    const { error } = await sb.from('lessons').update({
        course_code:  course  || undefined,
        lesson_title: title,
        topic_name:   topic   || null,
        youtube_url:  ytUrl   || null,
        pdf_url:      pdfUrl  || null,
        order_no:     order,
    }).eq('id', id);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 บันทึก'; }

    if (error) { showMsg(msg, 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    closeEditLessonModal();
    await loadLessonList();
}

// ---- ลบบทเรียน ----
async function deleteLesson(id) {
    const { error } = await sb.from('lessons').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await loadLessonList();
}

// ---- Drag & Drop เรียงลำดับ ----
function attachLessonDragListeners() {
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
            if (parseInt(item.dataset.id) !== _dragSrcId) item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
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
    const [moved] = newOrder.splice(srcIdx, 1);
    newOrder.splice(tgtIdx, 0, moved);

    await Promise.all(
        newOrder.map((l, i) => sb.from('lessons').update({ order_no: i + 1 }).eq('id', l.id))
    );
    await loadLessonList();
}