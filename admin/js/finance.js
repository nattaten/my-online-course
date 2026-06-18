// ============================================================
// finance.js - Weekly + monthly finance dashboard
// Rules:
//   vd_* = enrollments created in the period * course price, using enrollments.enrolled_at
//   ol_* = lessons created in the period * course price, using lessons.created_at (1 lesson = 1 course price)
// ============================================================

const FINANCE_WEEK_COUNT = 8;
const FINANCE_MONTH_COUNT = 6;

async function loadFinance() {
    const wrap = document.getElementById('finance-weeks');
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading-state">กำลังจัดสรุปการเงิน...</div>';

    try {
        const oldestWeekStart = buildWeekPeriods(FINANCE_WEEK_COUNT).at(-1).start;
        const oldestMonthStart = buildMonthPeriods(FINANCE_MONTH_COUNT).at(-1).start;
        const oldestStart = oldestWeekStart < oldestMonthStart ? oldestWeekStart : oldestMonthStart;

        const [coursesRes, enrollmentsRes, lessonsRes] = await Promise.all([
            sb.from('courses').select('id, course_code, name, subject, schedule_day, schedule_time, price, is_active').order('id', { ascending: true }),
            sb.from('enrollments').select('id, user_id, course_code, sort_order, enrolled_at, expires_at, note').gte('enrolled_at', oldestStart.toISOString()).order('enrolled_at', { ascending: false }),
            sb.from('lessons').select('id, course_code, lesson_title, created_at, pdf_url').gte('created_at', oldestStart.toISOString()).order('created_at', { ascending: false }),
        ]);

        if (coursesRes.error) throw coursesRes.error;
        if (enrollmentsRes.error) throw enrollmentsRes.error;
        if (lessonsRes.error) throw lessonsRes.error;

        const courses = coursesRes.data || [];
        const enrollments = enrollmentsRes.data || [];
        const lessons = lessonsRes.data || [];

        if (!courses.length) {
            wrap.innerHTML = '<div class="empty-state">ยังไม่มีคอร์สในระบบ</div>';
            return;
        }

        const model = buildFinanceModel(courses, enrollments, lessons);
        const weeks = buildWeekPeriods(FINANCE_WEEK_COUNT).map((period, index) => buildPeriodSummary(period, model, index === 0));
        const months = buildMonthPeriods(FINANCE_MONTH_COUNT).map((period, index) => buildPeriodSummary(period, model, index === 0));

        wrap.innerHTML = `
            ${renderFinanceHero(model, weeks[0], months[0])}
            <div class="finance-tabs-shell">
                <div class="finance-section-heading">
                    <div>
                        <h3>สรุปรายสัปดาห์</h3>
                    </div>
                </div>
                <div class="finance-timeline">
                    ${weeks.map((period, index) => renderTimelineItem(period, index)).join('')}
                </div>
            </div>
            <div class="finance-tabs-shell">
                <div class="finance-section-heading">
                    <div>
                        <h3>สรุปรายเดือน</h3>
                        <p>รวมรายได้สอนสดและวิดีโอที่เกิดขึ้นในเดือนนั้น</p>
                    </div>
                </div>
                <div class="finance-timeline">
                    ${months.map((period, index) => renderTimelineItem(period, index)).join('')}
                </div>
            </div>
        `;
    } catch (error) {
        wrap.innerHTML = `<div class="error-state">โหลด Finance ไม่สำเร็จ: ${escHtml(error.message)}</div>`;
    }
}

function buildFinanceModel(courses, enrollments, lessons) {
    const courseMap = new Map(courses.map(course => [course.course_code, course]));
    
    const vdEnrollments = enrollments
        .map(enrollment => ({ enrollment, course: courseMap.get(enrollment.course_code) }))
        .filter(item => item.course?.course_code?.startsWith('vd_') && item.enrollment.enrolled_at);

    // กรองเฉพาะบทเรียนสอนสดที่มีการแนบเอกสารเฉลย (pdf_url ไม่ว่าง)
    const olLessons = lessons
        .map(lesson => ({ lesson, course: courseMap.get(lesson.course_code) }))
        .filter(item => {
            return item.course?.course_code?.startsWith('ol_') && 
                   item.lesson.pdf_url && 
                   item.lesson.pdf_url.trim() !== '';
        });

    return { courses, enrollments, lessons, courseMap, vdEnrollments, olLessons };
}

function buildPeriodSummary(period, model, isCurrent) {
    const olGroups = new Map();
    const vdGroups = new Map();

    // คิดรายได้สอนสด: เช็กวันแนบเอกสารเฉลย ถ้าตรงช่วงเวลา นับเป็น 1 ครั้ง = ราคาคอร์สทันที
    model.olLessons.forEach(({ lesson, course }) => {
        const date = lesson.created_at ? new Date(lesson.created_at) : new Date();
        if (date < period.start || date > period.end) return;

        addFinanceGroupRow(olGroups, course, 'ol', 'ครั้งที่สอน');
    });

    // คิดรายได้วิดีโอ: เช็กวันสมัครเรียนใหม่
    model.vdEnrollments.forEach(({ enrollment, course }) => {
        const date = new Date(enrollment.enrolled_at);
        if (date < period.start || date > period.end) return;
        addFinanceGroupRow(vdGroups, course, 'vd', 'คนสมัคร');
    });

    const olRows = sortFinanceRows([...olGroups.values()]);
    const vdRows = sortFinanceRows([...vdGroups.values()]);
    const rows = [...olRows, ...vdRows];
    const olTotal = olRows.reduce((sum, row) => sum + row.amount, 0);
    const vdTotal = vdRows.reduce((sum, row) => sum + row.amount, 0);

    return {
        ...period,
        isCurrent,
        rows,
        olRows,
        vdRows,
        olTotal,
        vdTotal,
        total: olTotal + vdTotal,
    };
}

function addFinanceGroupRow(groups, course, kind, countLabel) {
    const current = groups.get(course.course_code) || {
        kind,
        code: course.course_code,
        name: course.name || course.course_code,
        count: 0,
        price: Number(course.price || 0),
        amount: 0,
        detail: '',
    };

    current.count += 1; // เพิ่มจำนวนครั้งที่สอน หรือจำนวนคนสมัคร
    current.amount = current.count * current.price; // สูตรตรงตัว: จำนวน x ราคาคอร์ส
    current.detail = `${current.count.toLocaleString('th-TH')} ${countLabel} × ${formatBaht(current.price)}`;

    groups.set(course.course_code, current);
}

function sortFinanceRows(rows) {
    return rows.sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
}

function renderFinanceHero(model, currentWeek, currentMonth) {
    const totalThisWeek = currentWeek.total;
    const vdThisWeekCount = currentWeek.vdRows.reduce((sum, row) => sum + row.count, 0);
    const olThisWeekCount = currentWeek.olRows.reduce((sum, row) => sum + row.count, 0);

    return `
        <div class="finance-hero">
            <div class="finance-hero-main">
                <span class="finance-eyebrow">Finance Dashboard</span>
                <h3>${formatBaht(totalThisWeek)}</h3>
                <p>ยอดรวมสัปดาห์นี้: ${escHtml(currentWeek.label)}</p>
            </div>
            <div class="finance-hero-metrics">
                ${renderMetric('สอนสดสัปดาห์นี้', formatBaht(currentWeek.olTotal), `${olThisWeekCount.toLocaleString('th-TH')} ครั้งที่สอน`)}
                ${renderMetric('วิดีโอสัปดาห์นี้', formatBaht(currentWeek.vdTotal), `${vdThisWeekCount.toLocaleString('th-TH')} คนสมัครใหม่`)}
                ${renderMetric('รวมเดือนนี้', formatBaht(currentMonth.total), 'สอนสด + วิดีโอ')}
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

function renderTimelineItem(period, index) {
    const empty = !period.rows.length;
    const detailsId = `finance-detail-${period.type}-${index}`;
    const expanded = index === 0 && !empty;
    return `
        <article class="finance-timeline-item ${period.isCurrent ? 'is-current' : ''} ${empty ? 'is-empty' : ''}">
            <div class="finance-timeline-dot"></div>
            <div class="finance-timeline-card">
                <button class="finance-timeline-summary" type="button" aria-expanded="${expanded}" aria-controls="${detailsId}" onclick="toggleFinanceDetails('${detailsId}', this)" ${empty ? 'disabled' : ''}>
                    <span class="finance-summary-main">
                        <span class="finance-period-label">${period.isCurrent ? (period.type === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้') : period.label}</span>
                        <strong>${period.isCurrent ? period.label : periodRelativeLabel(period, index)}</strong>
                        <small>
                            <span class="${period.olTotal ? '' : 'is-muted'}">สอนสด ${formatBaht(period.olTotal)}</span>
                            <span aria-hidden="true"> · </span>
                            <span class="${period.vdTotal ? '' : 'is-muted'}">วิดีโอ ${formatBaht(period.vdTotal)}</span>
                        </small>
                    </span>
                    <span class="finance-summary-total">
                        <strong>${formatBaht(period.total)}</strong>
                        <small class="finance-detail-hint">${empty ? 'ไม่มีรายการ' : expanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}</small>
                    </span>
                </button>
                <div class="finance-timeline-details ${expanded ? 'is-open' : ''}" id="${detailsId}" ${expanded ? '' : 'hidden'}>
                    <div class="finance-detail-inner">
                        ${empty ? '<div class="finance-empty-inline">ยังไม่มีรายการในช่วงนี้</div>' : renderPeriodDetailGroups(period)}
                    </div>
                </div>
            </div>
        </article>`;
}

function toggleFinanceDetails(id, button) {
    const panel = document.getElementById(id);
    if (!panel) return;
    const willOpen = panel.hasAttribute('hidden');
    if (willOpen) {
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add('is-open'));
    } else {
        panel.classList.remove('is-open');
        window.setTimeout(() => {
            if (!panel.classList.contains('is-open')) panel.hidden = true;
        }, 180);
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
        </div>`;
}

function renderDetailGroup(label, rows) {
    if (!rows.length) {
        return `
            <section class="finance-detail-group is-empty">
                <h4>${label}</h4>
                <p>ยังไม่มีรายได้ในหมวดนี้</p>
            </section>`;
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

function buildWeekPeriods(count) {
    const currentStart = getWeekStart(new Date());
    return Array.from({ length: count }, (_, index) => {
        const start = new Date(currentStart);
        start.setDate(start.getDate() - index * 7);
        const end = endOfDay(addDays(start, 6));
        return {
            type: 'week',
            typeLabel: 'สัปดาห์',
            start,
            end,
            label: formatDateRange(start, end),
        };
    });
}

function buildMonthPeriods(count) {
    const now = new Date();
    return Array.from({ length: count }, (_, index) => {
        const start = new Date(now.getFullYear(), now.getMonth() - index, 1);
        const end = endOfDay(new Date(start.getFullYear(), start.getMonth() + 1, 0));
        return {
            type: 'month',
            typeLabel: 'เดือน',
            start,
            end,
            label: start.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
        };
    });
}

function getWeekStart(date) {
    const d = new Date(date);
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

function formatDateRange(start, end) {
    return start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
        + ' - '
        + end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBaht(value) {
    return '฿' + Number(value || 0).toLocaleString('th-TH');
}