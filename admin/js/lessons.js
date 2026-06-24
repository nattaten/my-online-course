// ============================================================
// lessons.js — จัดการบทเรียน (Filter by course + CRUD + Drag Sort)
// ใช้ตาราง: lessons, courses
//
// [NEW] bill_at column:
//   null     → ไม่คิดเงิน (excluded from finance)
//   non-null → คิดเงิน   (timestamp admin confirmed billing)
//   Only relevant for ol_* courses. vd_* courses are unaffected.
// ============================================================

let _currentLessons = [];
let _dragSrcId = null;
let _lessonSuggestionCache = new Map();

async function getLessonSuggestions(courseCode) {
    if (!courseCode) return [];
    if (_lessonSuggestionCache.has(courseCode)) return _lessonSuggestionCache.get(courseCode);

    const { data, error } = await sb
        .from('lessons')
        .select('topic_name, lesson_title, course_code, order_no')
        .eq('course_code', courseCode)
        .order('order_no', { ascending: true });

    if (error) {
        console.warn('Could not load lesson suggestions:', error.message);
        return [];
    }

    const rows = data || [];
    _lessonSuggestionCache.set(courseCode, rows);
    return rows;
}

function uniqueNonEmpty(values) {
    return [...new Set(values.map(value => (value || '').trim()).filter(Boolean))];
}

function escAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderDatalistOptions(id, values) {
    const list = document.getElementById(id);
    if (!list) return;
    list.innerHTML = uniqueNonEmpty(values)
        .map(value => `<option value="${escAttr(value)}"></option>`)
        .join('');
}

async function refreshLessonTopicOptions(courseSelectId, topicListId, titleListId) {
    const courseCode = document.getElementById(courseSelectId)?.value;
    const rows = await getLessonSuggestions(courseCode);
    renderDatalistOptions(topicListId, rows.map(row => row.topic_name));
    renderDatalistOptions(titleListId, rows.map(row => row.lesson_title));
}

async function refreshLessonTitleOptions(courseSelectId, topicInputId, titleListId) {
    const courseCode = document.getElementById(courseSelectId)?.value;
    const topic = document.getElementById(topicInputId)?.value.trim();
    const rows = await getLessonSuggestions(courseCode);
    const hasExactTopic = topic && rows.some(row => (row.topic_name || '').trim() === topic);
    const filteredRows = hasExactTopic ? rows.filter(row => (row.topic_name || '').trim() === topic) : rows;
    renderDatalistOptions(titleListId, filteredRows.map(row => row.lesson_title));
}

async function handleLessonCourseChange() {
    document.getElementById('topic-name').value = '';
    document.getElementById('lesson-title').value = '';
    // [NEW] Show/hide the bill toggle based on whether this is an ol_ course
    updateAddFormBillToggleVisibility();
    await refreshLessonTopicOptions('lesson-course-select', 'lesson-topic-options', 'lesson-title-options');
}

async function handleLessonTopicChange() {
    await refreshLessonTitleOptions('lesson-course-select', 'topic-name', 'lesson-title-options');
}

async function handleEditLessonCourseChange() {
    document.getElementById('edit-lesson-topic').value = '';
    document.getElementById('edit-lesson-title').value = '';
    // [NEW] Show/hide the edit modal bill toggle
    updateEditFormBillToggleVisibility();
    await refreshLessonTopicOptions('edit-lesson-course', 'edit-lesson-topic-options', 'edit-lesson-title-options');
}

async function handleEditLessonTopicChange() {
    await refreshLessonTitleOptions('edit-lesson-course', 'edit-lesson-topic', 'edit-lesson-title-options');
}

function clearLessonSuggestionCache(courseCode) {
    if (courseCode) _lessonSuggestionCache.delete(courseCode);
    else _lessonSuggestionCache = new Map();
}

// ─── Bill toggle helpers ──────────────────────────────────────────────────────

/** Returns true if the given course_code is a live (ol_) course */
function isLiveCourse(courseCode) {
    return typeof courseCode === 'string' && courseCode.startsWith('ol_');
}

/**
 * Show/hide the "คิดเงิน" row in the Add Lesson form depending on
 * whether the selected course is ol_*.
 */
function updateAddFormBillToggleVisibility() {
    const courseCode = document.getElementById('lesson-course-select')?.value || '';
    const row = document.getElementById('add-lesson-bill-row');
    if (row) row.style.display = isLiveCourse(courseCode) ? '' : 'none';
}

/**
 * Show/hide the "คิดเงิน" row in the Edit Lesson modal depending on
 * whether the selected course is ol_*.
 */
function updateEditFormBillToggleVisibility() {
    const courseCode = document.getElementById('edit-lesson-course')?.value || '';
    const row = document.getElementById('edit-lesson-bill-row');
    if (row) row.style.display = isLiveCourse(courseCode) ? '' : 'none';
}

// ─── Load lesson list ─────────────────────────────────────────────────────────
async function loadLessonList() {
    const courseCode = document.getElementById('lesson-filter-course')?.value;
    const el = document.getElementById('lesson-list');
    if (!el) return;

    el.innerHTML = '<div class="loading-state">กำลังโหลด...</div>';

    // [CHANGED] include bill_at in the select
    let query = sb.from('lessons').select('*, bill_at').order('order_no', { ascending: true });
    if (courseCode) query = query.eq('course_code', courseCode);

    const { data, error } = await query;

    if (error) { el.innerHTML = `<div class="error-state">โหลดไม่สำเร็จ: ${error.message}</div>`; return; }
    if (!data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีบทเรียน' + (courseCode ? `ในคอร์สนี้` : '') + '</div>';
        return;
    }

    _currentLessons = data;

    el.innerHTML = data.map(l => {
        const live = isLiveCourse(l.course_code);
        const billed = live && l.bill_at != null;

        // Bill badge — only shown for ol_* courses
        const billBadge = live
            ? `<button
                    class="bill-toggle-btn ${billed ? 'is-billed' : 'is-unbilled'}"
                    title="${billed ? `คิดเงินแล้ว: ${formatDateShort(l.bill_at)}\nคลิกเพื่อยกเลิก` : 'ยังไม่คิดเงิน — คลิกเพื่อตั้งคิดเงิน'}"
                    onclick="toggleBillAt(${l.id}, ${billed ? 'true' : 'false'})">
                    ${billed ? '✅ คิดเงิน' : '⬜ ไม่คิดเงิน'}
               </button>`
            : '';

        return `
        <div class="list-item draggable" data-id="${l.id}" draggable="true">
            <span class="drag-handle" title="ลากเพื่อเรียงลำดับ">⣿</span>
            <div class="list-item-info">
                <div class="list-item-name">
                    <span class="badge badge-gray mono-text">#${l.order_no}</span>
                    ${escHtml(l.lesson_title || '(ไม่มีชื่อ)')}
                    ${billBadge}
                </div>
                <div class="list-item-sub">
                    ${l.topic_name ? `📌 ${escHtml(l.topic_name)} · ` : ''}
                    <span class="mono-text">${escHtml(l.course_code)}</span>
                    ${l.youtube_url ? ` · 🎬 YouTube` : ''}
                    ${l.pdf_url     ? ` · 📄 PDF` : ''}
                    ${live && billed ? ` · 💰 ${formatDateShort(l.bill_at)}` : ''}
                </div>
            </div>
            <div class="list-item-actions">
                <button class="icon-btn edit" title="แก้ไข"
                    onclick='openEditLessonModal(${JSON.stringify(l)})'>✏️</button>
                <button class="icon-btn delete" title="ลบ"
                    onclick="confirmDelete('ลบบทเรียน <b>${escHtml(l.lesson_title || '')}</b>?', () => deleteLesson(${l.id}))">🗑</button>
            </div>
        </div>`;
    }).join('');

    attachLessonDragListeners();
}

// ─── Toggle bill_at directly from the list ───────────────────────────────────

/**
 * Called when admin clicks the bill toggle button in the lesson list.
 * currentlyBilled = true  → set bill_at = NULL  (ไม่คิดเงิน)
 * currentlyBilled = false → set bill_at = NOW() (คิดเงิน)
 */
async function toggleBillAt(lessonId, currentlyBilled) {
    const newValue = currentlyBilled ? null : new Date().toISOString();
    const { error } = await sb.from('lessons').update({ bill_at: newValue }).eq('id', lessonId);
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return; }
    clearLessonSuggestionCache();
    await loadLessonList();
}

// ─── Add lesson ───────────────────────────────────────────────────────────────
async function addLesson() {
    const msg        = document.getElementById('lesson-msg');
    const courseCode = document.getElementById('lesson-course-select')?.value;
    const title      = document.getElementById('lesson-title')?.value.trim();
    const topic      = document.getElementById('topic-name')?.value.trim();
    const ytUrl      = document.getElementById('youtube-url')?.value.trim();
    const pdfUrl     = document.getElementById('pdf-url')?.value.trim();
    const orderNo    = parseInt(document.getElementById('lesson-order')?.value) || 0;

    if (!courseCode || !title) {
        showMsg(msg, 'กรุณาเลือกคอร์สและกรอกชื่อบทเรียน', 'error'); return;
    }

    // [NEW] Read bill toggle — only for ol_* courses
    let billAt = null;
    if (isLiveCourse(courseCode)) {
        const billChecked = document.getElementById('add-lesson-bill-checkbox')?.checked;
        billAt = billChecked ? new Date().toISOString() : null;
    }

    const { error } = await sb.from('lessons').insert([{
        course_code:  courseCode,
        lesson_title: title,
        topic_name:   topic   || null,
        youtube_url:  ytUrl   || null,
        pdf_url:      pdfUrl  || null,
        order_no:     orderNo,
        bill_at:      billAt,   // [NEW]
    }]);

    if (error) { showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }

    clearLessonSuggestionCache(courseCode);
    showMsg(msg, `✅ เพิ่มบทเรียน "${title}" สำเร็จ`, 'success');
    ['lesson-title', 'topic-name', 'youtube-url', 'pdf-url', 'lesson-order']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    // Reset bill checkbox
    const billCb = document.getElementById('add-lesson-bill-checkbox');
    if (billCb) billCb.checked = false;

    const filterEl = document.getElementById('lesson-filter-course');
    if (filterEl && !filterEl.value) filterEl.value = courseCode;

    await loadLessonList();
    await refreshLessonTopicOptions('lesson-course-select', 'lesson-topic-options', 'lesson-title-options');
}

// ─── Edit lesson modal ────────────────────────────────────────────────────────
async function openEditLessonModal(lesson) {
    document.getElementById('edit-lesson-id').value      = lesson.id;
    document.getElementById('edit-lesson-title').value   = lesson.lesson_title || '';
    document.getElementById('edit-lesson-topic').value   = lesson.topic_name   || '';
    document.getElementById('edit-lesson-yturl').value   = lesson.youtube_url  || '';
    document.getElementById('edit-lesson-pdf').value     = lesson.pdf_url      || '';
    document.getElementById('edit-lesson-order').value   = lesson.order_no     || 0;
    document.getElementById('edit-lesson-msg').textContent = '';

    // Course dropdown
    const sel = document.getElementById('edit-lesson-course');
    if (sel && window._allCourses?.length) {
        sel.innerHTML = window._allCourses.map(c =>
            `<option value="${c.course_code}" ${c.course_code === lesson.course_code ? 'selected' : ''}>${c.name} (${c.course_code})</option>`
        ).join('');
    }

    // [NEW] Set bill toggle state
    const billCb = document.getElementById('edit-lesson-bill-checkbox');
    if (billCb) {
        billCb.checked = lesson.bill_at != null;
    }
    // Store current bill_at so we can decide whether to preserve or overwrite
    document.getElementById('edit-lesson-modal').dataset.currentBillAt = lesson.bill_at || '';

    // Show/hide bill row based on course type
    updateEditFormBillToggleVisibility();

    document.getElementById('edit-lesson-modal').style.display = 'flex';
    await refreshLessonTopicOptions('edit-lesson-course', 'edit-lesson-topic-options', 'edit-lesson-title-options');
    await refreshLessonTitleOptions('edit-lesson-course', 'edit-lesson-topic', 'edit-lesson-title-options');
    setTimeout(() => document.getElementById('edit-lesson-title')?.focus(), 150);
}

function closeEditLessonModal() {
    document.getElementById('edit-lesson-modal').style.display = 'none';
}

async function saveEditLesson() {
    const msg    = document.getElementById('edit-lesson-msg');
    const id     = document.getElementById('edit-lesson-id')?.value;
    const title  = document.getElementById('edit-lesson-title')?.value.trim();
    const course = document.getElementById('edit-lesson-course')?.value;
    const topic  = document.getElementById('edit-lesson-topic')?.value.trim();
    const ytUrl  = document.getElementById('edit-lesson-yturl')?.value.trim();
    const pdfUrl = document.getElementById('edit-lesson-pdf')?.value.trim();
    const order  = parseInt(document.getElementById('edit-lesson-order')?.value) || 0;

    if (!title) { showMsg(msg, 'กรุณากรอกชื่อบทเรียน', 'error'); return; }

    // [NEW] Resolve bill_at
    let billAt = undefined; // undefined = don't touch the column (non-ol_ courses)
    if (isLiveCourse(course)) {
        const billChecked    = document.getElementById('edit-lesson-bill-checkbox')?.checked;
        const currentBillAt  = document.getElementById('edit-lesson-modal')?.dataset.currentBillAt || '';

        if (billChecked) {
            // Keep existing timestamp if already billed; otherwise stamp now
            billAt = currentBillAt ? currentBillAt : new Date().toISOString();
        } else {
            billAt = null; // ไม่คิดเงิน
        }
    }

    const saveBtn = document.querySelector('#edit-lesson-modal .btn-success');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก...'; }

    const updatePayload = {
        course_code:  course  || undefined,
        lesson_title: title,
        topic_name:   topic   || null,
        youtube_url:  ytUrl   || null,
        pdf_url:      pdfUrl  || null,
        order_no:     order,
    };

    // Only include bill_at in payload when we have a resolved value (ol_* courses)
    if (billAt !== undefined) updatePayload.bill_at = billAt;

    const { error } = await sb.from('lessons').update(updatePayload).eq('id', id);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 บันทึก'; }

    if (error) { showMsg(msg, 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    clearLessonSuggestionCache(course);
    closeEditLessonModal();
    await loadLessonList();
}

// ─── Delete lesson ────────────────────────────────────────────────────────────
async function deleteLesson(id) {
    const { error } = await sb.from('lessons').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    clearLessonSuggestionCache();
    await loadLessonList();
}

// ─── Drag & Drop reorder ──────────────────────────────────────────────────────
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