// ============================================================
// lessons.js — จัดการบทเรียน (Filter by course + CRUD + Drag Sort + Auto-suggest)
// ============================================================

let _currentLessons = [];
let _dragSrcId = null;
let _isSyncingCourse = false;   // กัน infinite loop ระหว่างการ sync ฟอร์มซ้าย-ขวา

// ─── ดึง topic_name ที่เคยมีในคอร์สนั้น มาสร้าง dropdown (เรียงหัวข้อที่สร้างล่าสุดไว้บน) ───────
// แสดงช่องเดียว: <select> เลือกหัวข้อเดิม ถ้าเลือก "พิมพ์หัวข้อใหม่" ช่องพิมพ์จึงจะโผล่
const NEW_TOPIC_VALUE = '__new_topic__';

async function refreshLessonTopicOptions(courseSelectId = 'lesson-course-select', datalistId = 'lesson-topic-options') {
    const courseCode = document.getElementById(courseSelectId)?.value;

    // จับคู่ datalist -> ช่องกรอกหัวข้อ และ id ของ dropdown
    const cfg = {
        'lesson-topic-options':      { selectId: 'lesson-topic-select',      inputId: 'topic-name' },
        'edit-lesson-topic-options': { selectId: 'edit-lesson-topic-select', inputId: 'edit-lesson-topic' },
    }[datalistId];
    if (!cfg) return;

    const input = document.getElementById(cfg.inputId);
    if (!input) return;

    // ถอด datalist ของหัวข้อออกจากช่องกรอก (กัน dropdown ซ้ำ)
    input.removeAttribute('list');
    const oldDatalist = document.getElementById(datalistId);
    if (oldDatalist) oldDatalist.innerHTML = '';

    // ถ้ายังไม่มี <select> ให้สร้างและแทรกไว้เหนือช่องหัวข้อ
    let select = document.getElementById(cfg.selectId);
    if (!select) {
        select = document.createElement('select');
        select.id = cfg.selectId;
        select.className = input.className;
        select.style.width = '100%';

        // ลูกศรสามเหลี่ยมทึบ (แทนลูกศรเดิมของเบราว์เซอร์)
        const arrowSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='12' viewBox='0 0 16 12'>" +
            "<path d='M2 2h12L8 10z' fill='%23233229' stroke='%23233229' stroke-width='2' stroke-linejoin='round'/></svg>";
        select.style.appearance = 'none';
        select.style.webkitAppearance = 'none';
        select.style.backgroundImage = `url("data:image/svg+xml,${arrowSvg}")`;
        select.style.backgroundRepeat = 'no-repeat';
        select.style.backgroundPosition = 'right 16px center';
        select.style.backgroundSize = '16px 12px';
        select.style.paddingRight = '44px';

        select.addEventListener('change', () => {
            if (select.value === NEW_TOPIC_VALUE) {
                input.value = '';
                input.style.display = '';
                input.placeholder = 'พิมพ์หัวข้อใหม่';
                input.focus();
            } else {
                input.value = select.value;      // '' หรือหัวข้อที่เลือก
                input.style.display = 'none';
            }
        });
        input.parentNode.insertBefore(select, input);
    }

    const placeholder = '<option value="">— เลือกหัวข้อที่เคยมีในคอร์สนี้ —</option>';

    if (!courseCode) {
        select.innerHTML = placeholder;
        input.style.display = 'none';
        return;
    }

    select.innerHTML = '<option value="">กำลังโหลด...</option>';

    const { data, error } = await sb
        .from('lessons')
        .select('id, topic_name')
        .eq('course_code', courseCode)
        .not('topic_name', 'is', null)
        .neq('topic_name', '');

    if (error) {
        select.innerHTML = placeholder;
        input.style.display = 'none';
        return;
    }

    // รวมตามหัวข้อ เก็บ id ที่น้อยที่สุด (ครั้งแรกที่หัวข้อนี้ถูกสร้าง)
    const firstIdMap = new Map();
    data.forEach(l => {
        const t = (l.topic_name || '').trim();
        if (!t) return;
        const cur = firstIdMap.get(t);
        if (cur === undefined || l.id < cur) firstIdMap.set(t, l.id);
    });

    // เรียง id ครั้งแรกมากสุด -> น้อยสุด (หัวข้อใหม่ล่าสุดอยู่บน)
    const topics = [...firstIdMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([topic]) => topic);

    select.innerHTML =
        placeholder +
        topics.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('') +
        `<option value="${NEW_TOPIC_VALUE}">➕ พิมพ์หัวข้อใหม่</option>`;

    // ตั้งสถานะเริ่มต้นตามค่าที่อยู่ในช่องกรอกตอนนี้ (เช่น ตอนเปิด modal แก้ไข)
    const current = input.value.trim();
    if (current && topics.includes(current)) {
        select.value = current;
        input.style.display = 'none';
    } else if (current || topics.length === 0) {
        // มีค่าที่ไม่อยู่ในรายการ หรือคอร์สนี้ยังไม่มีหัวข้อเลย -> ให้พิมพ์เอง
        select.value = NEW_TOPIC_VALUE;
        input.style.display = '';
        input.placeholder = 'พิมพ์หัวข้อใหม่';
    } else {
        select.value = '';
        input.style.display = 'none';
    }
}

// ─── ดึง lesson_title ที่ไม่ซ้ำกัน จากตาราง lessons ตาม course_code ───────
async function refreshLessonTitleOptions(courseSelectId = 'lesson-course-select', datalistId = 'lesson-title-options') {
    const courseCode = document.getElementById(courseSelectId)?.value;
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;

    if (!courseCode) {
        datalist.innerHTML = '';
        return;
    }

    datalist.innerHTML = '<option value="กำลังโหลด..."></option>';

    const { data, error } = await sb
        .from('lessons')
        .select('lesson_title')
        .eq('course_code', courseCode)
        .not('lesson_title', 'is', null)
        .order('lesson_title', { ascending: true });

    if (error) {
        datalist.innerHTML = '';
        return;
    }

    const uniqueTitles = [...new Set(data.map(item => item.lesson_title).filter(Boolean))];
    datalist.innerHTML = uniqueTitles.map(title => `<option value="${escHtml(title)}">`).join('');
}

// ─── [HELPER] Auto order_no ─────────────────────────────────────
async function fetchNextOrderNo(courseCode) {
    if (!courseCode) return 1;
    const { data, error } = await sb
        .from('lessons')
        .select('order_no')
        .eq('course_code', courseCode)
        .order('order_no', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) return 1;
    return (data[0].order_no || 0) + 1;
}

async function updateAutoOrderNo(courseCode) {
    const orderInput = document.getElementById('lesson-order');
    if (!orderInput) return;

    if (!courseCode) {
        orderInput.value = 1;
        return;
    }

    orderInput.placeholder = '...';
    const nextOrder = await fetchNextOrderNo(courseCode);
    orderInput.value = nextOrder;
    orderInput.placeholder = '';
}

// ─── [MAIN] เมื่อเลือกคอร์สจากฟอร์มซ้าย (Add Form) ─────────────
async function handleLessonCourseChange() {
    if (_isSyncingCourse) return;
    _isSyncingCourse = true;

    try {
        const courseCode = document.getElementById('lesson-course-select')?.value || '';
        const topicInput = document.getElementById('topic-name');
        const titleInput = document.getElementById('lesson-title');

        // 1. เคลียร์ช่องหัวข้อ (เลือกจาก dropdown หรือพิมพ์เอง)
        if (topicInput) topicInput.value = '';

        // 2. เคลียร์ช่องชื่อบทเรียน
        if (titleInput) titleInput.value = '';

        // 3. อัปเดต order_no อัตโนมัติ
        await updateAutoOrderNo(courseCode);

        // 4. จัดการการแสดงผล Bill toggle
        updateAddFormBillToggleVisibility();

        // 5. Sync กับตัวกรองฝั่งขวา
        const filterEl = document.getElementById('lesson-filter-course');
        if (filterEl) {
            filterEl.value = courseCode;
            await loadLessonList();
        }

        // 6. ดึง Suggestion (topic_name และ lesson_title) ตาม course_code ที่เลือก
        await refreshAddFormSuggestions();

    } finally {
        _isSyncingCourse = false;
    }
}

// ─── [MAIN] เมื่อเปลี่ยนตัวกรองจากฟอร์มขวา (Filter) ──────────────────────────
async function handleLessonFilterChange() {
    if (_isSyncingCourse) return;
    _isSyncingCourse = true;

    try {
        const courseCode = document.getElementById('lesson-filter-course')?.value || '';
        const courseSelect = document.getElementById('lesson-course-select');
        const topicInput = document.getElementById('topic-name');
        const titleInput = document.getElementById('lesson-title');

        if (courseSelect && courseCode) {
            courseSelect.value = courseCode;

            // เคลียร์ช่องหัวข้อ (เลือกจาก dropdown หรือพิมพ์เอง)
            if (topicInput) topicInput.value = '';
            if (titleInput) titleInput.value = '';

            await updateAutoOrderNo(courseCode);
            updateAddFormBillToggleVisibility();

            // ดึง Suggestion จากตาราง lessons
            await refreshAddFormSuggestions();
        } else if (courseSelect && !courseCode) {
            // กรณีเลือก "ทั้งหมด"
            courseSelect.value = '';
            if (topicInput) topicInput.value = '';
            if (titleInput) titleInput.value = '';
            const orderEl = document.getElementById('lesson-order');
            if (orderEl) orderEl.value = 1;
            updateAddFormBillToggleVisibility();

            refreshAddFormSuggestions();
        }

        await loadLessonList();
    } finally {
        _isSyncingCourse = false;
    }
}

// ─── Edit Modal Handlers ─────────────────────────────────────────────────────
async function handleEditLessonCourseChange() {
    document.getElementById('edit-lesson-topic').value = '';
    document.getElementById('edit-lesson-title').value = '';
    updateEditFormBillToggleVisibility();

    // ดึง Suggestion สำหรับ Modal แก้ไข
    await refreshLessonTopicOptions('edit-lesson-course', 'edit-lesson-topic-options');
    await refreshLessonTitleOptions('edit-lesson-course', 'edit-lesson-title-options');
}

async function handleEditLessonTopicChange() {
    await refreshLessonTitleOptions('edit-lesson-course', 'edit-lesson-title-options');
}

function clearLessonSuggestionCache() {
    // เคลียร์ datalist เมื่อมีการเพิ่ม/ลบ/แก้ไข บทเรียน เพื่อให้โหลดข้อมูลใหม่ล่าสุด
    const datalists = ['lesson-topic-options', 'lesson-title-options', 'edit-lesson-topic-options', 'edit-lesson-title-options'];
    datalists.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    // รีเซ็ต dropdown หัวข้อ
    ['lesson-topic-select', 'edit-lesson-topic-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<option value="">— เลือกหัวข้อที่เคยมีในคอร์สนี้ —</option>';
    });
}

// โหลด dropdown/datalist ของฟอร์มเพิ่มบทเรียนใหม่ตามคอร์สที่เลือกอยู่
async function refreshAddFormSuggestions() {
    await refreshLessonTopicOptions('lesson-course-select', 'lesson-topic-options');
    await refreshLessonTitleOptions('lesson-course-select', 'lesson-title-options');
}

// ─── Bill toggle helpers ──────────────────────────────────────────────────────
function isLiveCourse(courseCode) {
    return typeof courseCode === 'string' && courseCode.startsWith('ol_');
}

function updateAddFormBillToggleVisibility() {
    const courseCode = document.getElementById('lesson-course-select')?.value || '';
    const row = document.getElementById('add-lesson-bill-row');
    if (row) row.style.display = isLiveCourse(courseCode) ? '' : 'none';
}

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

    let query = sb.from('lessons').select('*, bill_at').order('order_no', { ascending: false });
    if (courseCode) query = query.eq('course_code', courseCode);

    const { data, error } = await query;

    if (error) { el.innerHTML = `<div class="error-state">โหลดไม่สำเร็จ: ${error.message}</div>`; return; }
    if (!data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีบทเรียน' + (courseCode ? ` ในคอร์สนี้` : '') + '</div>';
        return;
    }

    _currentLessons = data;

    el.innerHTML = data.map(l => {
        const live = isLiveCourse(l.course_code);
        const billed = live && l.bill_at != null;

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
async function toggleBillAt(lessonId, currentlyBilled) {
    const newValue = currentlyBilled ? null : new Date().toISOString();
    const { error } = await sb.from('lessons').update({ bill_at: newValue }).eq('id', lessonId);
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return; }
    clearLessonSuggestionCache();
    await loadLessonList();
    await refreshAddFormSuggestions();
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
        bill_at:      billAt,
    }]);

    if (error) { showMsg(msg, 'เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }

    clearLessonSuggestionCache();
    showMsg(msg, `✅ เพิ่มบทเรียน "${title}" สำเร็จ`, 'success');

    ['lesson-title', 'topic-name', 'youtube-url', 'pdf-url', 'lesson-order']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const billCb = document.getElementById('add-lesson-bill-checkbox');
    if (billCb) billCb.checked = false;

    const filterEl = document.getElementById('lesson-filter-course');
    if (filterEl && !filterEl.value) filterEl.value = courseCode;

    await loadLessonList();
    await refreshAddFormSuggestions();
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

    const sel = document.getElementById('edit-lesson-course');
    if (sel && window._allCourses?.length) {
        sel.innerHTML = window._allCourses.map(c =>
            `<option value="${c.course_code}" ${c.course_code === lesson.course_code ? 'selected' : ''}>${c.name} (${c.course_code})</option>`
        ).join('');
    }

    const billCb = document.getElementById('edit-lesson-bill-checkbox');
    if (billCb) {
        billCb.checked = lesson.bill_at != null;
    }
    document.getElementById('edit-lesson-modal').dataset.currentBillAt = lesson.bill_at || '';

    updateEditFormBillToggleVisibility();
    document.getElementById('edit-lesson-modal').style.display = 'flex';

    await refreshLessonTopicOptions('edit-lesson-course', 'edit-lesson-topic-options');
    await refreshLessonTitleOptions('edit-lesson-course', 'edit-lesson-title-options');

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

    let billAt = undefined;
    if (isLiveCourse(course)) {
        const billChecked    = document.getElementById('edit-lesson-bill-checkbox')?.checked;
        const currentBillAt  = document.getElementById('edit-lesson-modal')?.dataset.currentBillAt || '';

        if (billChecked) {
            billAt = currentBillAt ? currentBillAt : new Date().toISOString();
        } else {
            billAt = null;
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

    if (billAt !== undefined) updatePayload.bill_at = billAt;

    const { error } = await sb.from('lessons').update(updatePayload).eq('id', id);

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 บันทึก'; }

    if (error) { showMsg(msg, 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }

    clearLessonSuggestionCache();
    closeEditLessonModal();
    await loadLessonList();
    await refreshAddFormSuggestions();
}

// ─── Delete lesson ────────────────────────────────────────────────────────────
async function deleteLesson(id) {
    const { error } = await sb.from('lessons').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    clearLessonSuggestionCache();
    await loadLessonList();
    await refreshAddFormSuggestions();
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

    // รายการแสดงจากมากไปน้อย: ตัวบนสุดได้ order_no สูงสุด
    const total = newOrder.length;
    await Promise.all(
        newOrder.map((l, i) => sb.from('lessons').update({ order_no: total - i }).eq('id', l.id))
    );
    await loadLessonList();
}