// ============================================================
// finance.js — Weekly + monthly finance dashboard
//
// Income sources:
//   vd_*  = enrollments.enrolled_at × course price
//   ol_*  = lessons.bill_at (non-null, admin-confirmed) × course price
//   extra = extra_tutoring_fees (manual entries per week/institution)
//
// [CHANGED] ol_* lessons are now counted by bill_at (set manually by admin)
// instead of created_at + pdf_url. This eliminates duplicate billing when
// instructors attach documents multiple times around a class.
// ============================================================

const FINANCE_WEEK_COUNT  = 8;
const FINANCE_MONTH_COUNT = 6;

const INSTITUTIONS = ['Qtutor', 'Jirachot Tutoring'];

// ─── Entry point ────────────────────────────────────────────
async function loadFinance() {
    const wrap = document.getElementById('finance-weeks');
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading-state">กำลังจัดสรุปการเงิน...</div>';

    try {
        const weekPeriods  = buildWeekPeriods(FINANCE_WEEK_COUNT);
        const monthPeriods = buildMonthPeriods(FINANCE_MONTH_COUNT);
        const oldestStart  = [weekPeriods.at(-1).start, monthPeriods.at(-1).start]
            .reduce((a, b) => (a < b ? a : b));

        const [coursesRes, enrollmentsRes, lessonsRes, extraFeesRes] = await Promise.all([
            sb.from('courses').select('id, course_code, name, subject, schedule_day, schedule_time, price, is_active').order('id', { ascending: true }),
            sb.from('enrollments').select('id, user_id, course_code, sort_order, enrolled_at, expires_at, note').gte('enrolled_at', oldestStart.toISOString()).order('enrolled_at', { ascending: false }),
            // [CHANGED] Only fetch ol_* lessons where admin has confirmed billing (bill_at IS NOT NULL).
            // We filter by bill_at range instead of created_at — no pdf_url check needed anymore.
            sb.from('lessons')
                .select('id, course_code, lesson_title, bill_at')
                .not('bill_at', 'is', null)
                .gte('bill_at', oldestStart.toISOString())
                .order('bill_at', { ascending: false }),
            sb.from('extra_tutoring_fees').select('id, week_start, institution, amount, note, created_at').gte('week_start', toDateString(weekPeriods.at(-1).start)).order('week_start', { ascending: false }),
        ]);

        if (coursesRes.error)     throw coursesRes.error;
        if (enrollmentsRes.error) throw enrollmentsRes.error;
        if (lessonsRes.error)     throw lessonsRes.error;
        if (extraFeesRes.error)   throw extraFeesRes.error;

        const courses    = coursesRes.data    || [];
        const enrollments = enrollmentsRes.data || [];
        const lessons    = lessonsRes.data    || [];
        const extraFees  = extraFeesRes.data  || [];

        if (!courses.length) {
            wrap.innerHTML = '<div class="empty-state">ยังไม่มีคอร์สในระบบ</div>';
            return;
        }

        const model = buildFinanceModel(courses, enrollments, lessons, extraFees);
        const weeks  = weekPeriods.map((period, i) => buildPeriodSummary(period, model, i === 0));
        const months = monthPeriods.map((period, i) => buildPeriodSummary(period, model, i === 0));

        wrap.innerHTML = `
            ${renderFinanceHero(model, weeks[0], months[0])}
            ${renderExtraFeeForm(weekPeriods)}
            <div class="finance-tabs-shell">
                <div class="finance-section-heading"><div><h3>สรุปรายสัปดาห์</h3></div></div>
                <div class="finance-timeline">
                    ${weeks.map((p, i) => renderTimelineItem(p, i)).join('')}
                </div>
            </div>
            <div class="finance-tabs-shell">
                <div class="finance-section-heading">
                    <div>
                        <h3>สรุปรายเดือน</h3>
                        <p>รวมรายได้สอนสด วิดีโอ และค่าสอนพิเศษที่เกิดขึ้นในเดือนนั้น</p>
                    </div>
                </div>
                <div class="finance-timeline">
                    ${months.map((p, i) => renderTimelineItem(p, i)).join('')}
                </div>
            </div>`;
    } catch (error) {
        wrap.innerHTML = `<div class="error-state">โหลด Finance ไม่สำเร็จ: ${escHtml(error.message)}</div>`;
    }
}

// ─── Data model ─────────────────────────────────────────────
function buildFinanceModel(courses, enrollments, lessons, extraFees) {
    const courseMap = new Map(courses.map(c => [c.course_code, c]));

    const vdEnrollments = enrollments
        .map(e => ({ enrollment: e, course: courseMap.get(e.course_code) }))
        .filter(({ enrollment, course }) =>
            course?.course_code?.startsWith('vd_') && enrollment.enrolled_at);

    // [CHANGED] ol_* lessons: use bill_at as the billing date.
    // pdf_url check is no longer needed — bill_at = null means "not billed" already.
    const olLessons = lessons
        .map(l => ({ lesson: l, course: courseMap.get(l.course_code) }))
        .filter(({ lesson, course }) =>
            course?.course_code?.startsWith('ol_') && lesson.bill_at != null);

    return { courses, enrollments, lessons, extraFees, courseMap, vdEnrollments, olLessons };
}

// ─── Period summary ─────────────────────────────────────────
function buildPeriodSummary(period, model, isCurrent) {
    const olGroups  = new Map();
    const vdGroups  = new Map();
    const extraRows = [];

    // สอนสด: วันที่คิดเงิน (bill_at) ที่ admin ตั้งด้วยตนเอง
    model.olLessons.forEach(({ lesson, course }) => {
        const date = new Date(lesson.bill_at);   // [CHANGED] bill_at, not created_at
        if (date < period.start || date > period.end) return;
        addFinanceGroupRow(olGroups, course, 'ol', 'ครั้งที่สอน');
    });

    // วิดีโอ: วันสมัครเรียน
    model.vdEnrollments.forEach(({ enrollment, course }) => {
        const date = new Date(enrollment.enrolled_at);
        if (date < period.start || date > period.end) return;
        addFinanceGroupRow(vdGroups, course, 'vd', 'คนสมัคร');
    });

    // ค่าสอนพิเศษ: week_start ตรงกับสัปดาห์, หรือตกใน month range
    model.extraFees.forEach(fee => {
        // week_start is a DATE string "YYYY-MM-DD" — interpret as local midnight
        const feeDate = parseDateLocal(fee.week_start);
        if (feeDate < period.start || feeDate > period.end) return;
        extraRows.push({
            id:          fee.id,
            institution: fee.institution,
            amount:      Number(fee.amount || 0),
            note:        fee.note || '',
            week_start:  fee.week_start,
        });
    });

    const olRows    = sortFinanceRows([...olGroups.values()]);
    const vdRows    = sortFinanceRows([...vdGroups.values()]);
    const olTotal   = olRows.reduce((s, r) => s + r.amount, 0);
    const vdTotal   = vdRows.reduce((s, r) => s + r.amount, 0);
    const extraTotal = extraRows.reduce((s, r) => s + r.amount, 0);

    return {
        ...period,
        isCurrent,
        rows: [...olRows, ...vdRows],   // legacy rows (used nowhere else, kept for compat)
        olRows,
        vdRows,
        extraRows,
        olTotal,
        vdTotal,
        extraTotal,
        total: olTotal + vdTotal + extraTotal,   // ← updated total
    };
}

function addFinanceGroupRow(groups, course, kind, countLabel) {
    const cur = groups.get(course.course_code) || {
        kind, code: course.course_code,
        name: course.name || course.course_code,
        count: 0, price: Number(course.price || 0), amount: 0, detail: '',
    };
    cur.count  += 1;
    cur.amount  = cur.count * cur.price;
    cur.detail  = `${cur.count.toLocaleString('th-TH')} ${countLabel} × ${formatBaht(cur.price)}`;
    groups.set(course.course_code, cur);
}

function sortFinanceRows(rows) {
    return rows.sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
}

// ─── Hero ────────────────────────────────────────────────────
function renderFinanceHero(model, currentWeek, currentMonth) {
    const vdCount = currentWeek.vdRows.reduce((s, r) => s + r.count, 0);
    const olCount = currentWeek.olRows.reduce((s, r) => s + r.count, 0);

    return `
        <div class="finance-hero">
            <div class="finance-hero-main">
                <span class="finance-eyebrow">Finance Dashboard</span>
                <h3>${formatBaht(currentWeek.total)}</h3>
                <p>ยอดรวมสัปดาห์นี้: ${escHtml(currentWeek.label)}</p>
            </div>
            <div class="finance-hero-metrics">
                ${renderMetric('สอนสดสัปดาห์นี้',  formatBaht(currentWeek.olTotal),    `${olCount.toLocaleString('th-TH')} ครั้งที่สอน`)}
                ${renderMetric('วิดีโอสัปดาห์นี้',  formatBaht(currentWeek.vdTotal),    `${vdCount.toLocaleString('th-TH')} คนสมัครใหม่`)}
                ${renderMetric('ค่าสอนพิเศษสัปดาห์นี้', formatBaht(currentWeek.extraTotal), `${currentWeek.extraRows.length} รายการ`)}
                ${renderMetric('รวมเดือนนี้',        formatBaht(currentMonth.total),    'สอนสด + วิดีโอ + พิเศษ')}
            </div>
        </div>`;
}

function renderMetric(label, value, meta) {
    return `
        <div class="finance-hero-metric">
            <span>${label}</span>
            <strong>${value}</strong>
            <small>${meta}</small>
        </div>`;
}

// ─── Extra Fee Form ──────────────────────────────────────────
function renderExtraFeeForm(weekPeriods) {
    const weekOptions = weekPeriods.map((p, i) => {
        const label = i === 0 ? `สัปดาห์นี้ (${p.label})` : p.label;
        return `<option value="${toDateString(p.start)}" ${i === 0 ? 'selected' : ''}>${escHtml(label)}</option>`;
    }).join('');

    const institutionOptions = INSTITUTIONS.map(inst =>
        `<option value="${escHtml(inst)}">${escHtml(inst)}</option>`
    ).join('');

    return `
        <div class="finance-tabs-shell">
            <div class="finance-section-heading">
                <div>
                    <h3>➕ บันทึกค่าสอนพิเศษ</h3>
                    <p>รายได้จากสถาบันภายนอก (Qtutor / Jirachot Tutoring) ที่ต้องการเพิ่มเติมด้วยตนเอง</p>
                </div>
            </div>
            <div class="panel" style="max-width:560px; margin:0 16px 20px;">
                <div class="field-row" style="gap:10px; flex-wrap:wrap;">
                    <div class="field" style="min-width:200px; flex:2;">
                        <label>สัปดาห์ <span class="required">*</span></label>
                        <select id="extra-fee-week">${weekOptions}</select>
                    </div>
                    <div class="field" style="min-width:180px; flex:2;">
                        <label>สถาบัน <span class="required">*</span></label>
                        <select id="extra-fee-institution">${institutionOptions}</select>
                    </div>
                    <div class="field" style="min-width:130px; flex:1;">
                        <label>จำนวนเงิน (บาท) <span class="required">*</span></label>
                        <input type="number" id="extra-fee-amount" placeholder="0" min="0" step="any">
                    </div>
                </div>
                <div class="field">
                    <label>หมายเหตุ (ไม่บังคับ)</label>
                    <input type="text" id="extra-fee-note" placeholder="เช่น สอนคอร์สพิเศษ ม.6 เดือนมิถุนายน">
                </div>
                <button class="btn btn-primary" onclick="submitExtraFee()">💾 บันทึกค่าสอนพิเศษ</button>
                <p id="extra-fee-msg" class="form-msg"></p>
            </div>
        </div>`;
}

// ─── Submit extra fee ────────────────────────────────────────
async function submitExtraFee() {
    const weekStart   = document.getElementById('extra-fee-week')?.value;
    const institution = document.getElementById('extra-fee-institution')?.value;
    const amountRaw   = document.getElementById('extra-fee-amount')?.value;
    const note        = document.getElementById('extra-fee-note')?.value?.trim() || null;
    const msgEl       = document.getElementById('extra-fee-msg');

    if (!weekStart || !institution) {
        showMsg(msgEl, 'กรุณาเลือกสัปดาห์และสถาบัน', 'error'); return;
    }
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount < 0) {
        showMsg(msgEl, 'กรุณาใส่จำนวนเงินที่ถูกต้อง (≥ 0)', 'error'); return;
    }

    const btn = document.querySelector('#extra-fee-msg')?.previousElementSibling;
    if (btn) btn.disabled = true;

    const { error } = await sb.from('extra_tutoring_fees').insert([
        { week_start: weekStart, institution, amount, note }
    ]);

    if (btn) btn.disabled = false;

    if (error) {
        showMsg(msgEl, `บันทึกไม่สำเร็จ: ${error.message}`, 'error');
        return;
    }

    showMsg(msgEl, '✅ บันทึกค่าสอนพิเศษเรียบร้อยแล้ว', 'success');
    if (document.getElementById('extra-fee-amount')) document.getElementById('extra-fee-amount').value = '';
    if (document.getElementById('extra-fee-note'))   document.getElementById('extra-fee-note').value   = '';

    // Reload finance to reflect the new entry
    setTimeout(() => loadFinance(), 800);
}

// ─── Timeline rendering ──────────────────────────────────────
function renderTimelineItem(period, index) {
    const empty     = !period.rows.length && !period.extraRows.length;
    const detailsId = `finance-detail-${period.type}-${index}`;
    const expanded  = index === 0 && !empty;

    return `
        <article class="finance-timeline-item ${period.isCurrent ? 'is-current' : ''} ${empty ? 'is-empty' : ''}">
            <div class="finance-timeline-dot"></div>
            <div class="finance-timeline-card">
                <button class="finance-timeline-summary" type="button" aria-expanded="${expanded}" aria-controls="${detailsId}" onclick="toggleFinanceDetails('${detailsId}', this)" ${empty ? 'disabled' : ''}>
                    <span class="finance-summary-main">
                        <span class="finance-period-label">${period.isCurrent ? (period.type === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้') : period.label}</span>
                        <strong>${period.isCurrent ? period.label : periodRelativeLabel(period, index)}</strong>
                        <small>
                            <span class="${period.olTotal    ? '' : 'is-muted'}">สอนสด ${formatBaht(period.olTotal)}</span>
                            <span aria-hidden="true"> · </span>
                            <span class="${period.vdTotal    ? '' : 'is-muted'}">วิดีโอ ${formatBaht(period.vdTotal)}</span>
                            <span aria-hidden="true"> · </span>
                            <span class="${period.extraTotal ? '' : 'is-muted'}">พิเศษ ${formatBaht(period.extraTotal)}</span>
                        </small>
                    </span>
                    <span class="finance-summary-total">
                        <strong>${formatBaht(period.total)}</strong>
                        <small class="finance-detail-hint">${empty ? 'ไม่มีรายการ' : expanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}</small>
                    </span>
                </button>
                <div class="finance-timeline-details ${expanded ? 'is-open' : ''}" id="${detailsId}" ${expanded ? '' : 'hidden'}>
                    <div class="finance-detail-inner">
                        ${empty
                            ? '<div class="finance-empty-inline">ยังไม่มีรายการในช่วงนี้</div>'
                            : renderPeriodDetailGroups(period)}
                    </div>
                </div>
            </div>
        </article>`;
}

function toggleFinanceDetails(id, button) {
    const panel    = document.getElementById(id);
    if (!panel) return;
    const willOpen = panel.hasAttribute('hidden');
    if (willOpen) {
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add('is-open'));
    } else {
        panel.classList.remove('is-open');
        window.setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, 180);
    }
    button?.setAttribute('aria-expanded', String(willOpen));
    const hint = button?.querySelector('.finance-detail-hint');
    if (hint && hint.textContent !== 'ไม่มีรายการ') hint.textContent = willOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด';
}

function periodRelativeLabel(period, index) {
    if (index === 1) return period.type === 'week' ? 'สัปดาห์ก่อน' : 'เดือนก่อน';
    return period.typeLabel;
}

function renderPeriodDetailGroups(period) {
    return `
        <div class="finance-detail-groups">
            ${renderDetailGroup('วิดีโอ', period.vdRows)}
            ${renderDetailGroup('สอนสด', period.olRows)}
            ${renderExtraDetailGroup(period.extraRows)}
        </div>`;
}

function renderDetailGroup(label, rows) {
    if (!rows.length) {
        return `<section class="finance-detail-group is-empty"><h4>${label}</h4><p>ยังไม่มีรายได้ในหมวดนี้</p></section>`;
    }
    return `
        <section class="finance-detail-group">
            <h4>${label}</h4>
            ${rows.map(row => `
                <div class="finance-detail-line">
                    <div>
                        <strong>${escHtml(row.name)}</strong>
                        <span>${escHtml(row.detail)} = ${formatBaht(row.amount)}</span>
                    </div>
                </div>`).join('')}
        </section>`;
}

function renderExtraDetailGroup(rows) {
    if (!rows.length) {
        return `<section class="finance-detail-group is-empty"><h4>ค่าสอนพิเศษ</h4><p>ยังไม่มีรายได้ในหมวดนี้</p></section>`;
    }
    return `
        <section class="finance-detail-group">
            <h4>ค่าสอนพิเศษ</h4>
            ${rows.map(row => `
                <div class="finance-detail-line">
                    <div>
                        <strong>${escHtml(row.institution)}</strong>
                        <span>${row.note ? escHtml(row.note) + ' · ' : ''}${formatBaht(row.amount)}</span>
                    </div>
                    <button class="icon-btn" style="color:var(--danger); font-size:13px; margin-left:8px;" onclick="deleteExtraFee(${row.id})" title="ลบรายการนี้">🗑</button>
                </div>`).join('')}
        </section>`;
}

// ─── Delete extra fee ────────────────────────────────────────
function deleteExtraFee(id) {
    confirmDelete(
        `ยืนยันการลบค่าสอนพิเศษ ID <strong>#${id}</strong>?`,
        async () => {
            const { error } = await sb.from('extra_tutoring_fees').delete().eq('id', id);
            if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
            loadFinance();
        }
    );
}

// ─── Period builders ─────────────────────────────────────────
function buildWeekPeriods(count) {
    const currentStart = getWeekStart(new Date());
    return Array.from({ length: count }, (_, i) => {
        const start = addDays(currentStart, -i * 7);
        const end   = endOfDay(addDays(start, 6));
        return { type: 'week', typeLabel: 'สัปดาห์', start, end, label: formatDateRange(start, end) };
    });
}

function buildMonthPeriods(count) {
    const now = new Date();
    return Array.from({ length: count }, (_, i) => {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end   = endOfDay(new Date(start.getFullYear(), start.getMonth() + 1, 0));
        return { type: 'month', typeLabel: 'เดือน', start, end, label: start.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) };
    });
}

// ─── Date utilities ──────────────────────────────────────────
function getWeekStart(date) {
    const d   = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

/** Parse a "YYYY-MM-DD" string as local midnight (not UTC) */
function parseDateLocal(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Format a Date as "YYYY-MM-DD" for Supabase DATE columns */
function toDateString(date) {
    const y  = date.getFullYear();
    const m  = String(date.getMonth() + 1).padStart(2, '0');
    const d  = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDateRange(start, end) {
    return start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
        + ' - '
        + end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBaht(value) {
    return '฿' + Number(value || 0).toLocaleString('th-TH');
}