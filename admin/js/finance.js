// ============================================================
// finance.js — รายงานการเงินรายสัปดาห์ (Weekly Financial Report)
// ใช้ตาราง: enrollments, lessons, courses
//
// ลอจิก:
//   vd_* → นับแถว enrollments.enrolled_at ในสัปดาห์นั้น × price
//   ol_* → (นักเรียนทั้งหมดที่ enroll) × (จำนวน lessons ที่สร้างในสัปดาห์นั้น) × price
// ============================================================

const FINANCE_WEEKS_BACK = 12; // แสดงย้อนหลังกี่สัปดาห์

// ---- Entry point ----
async function loadFinance() {
    const wrap = document.getElementById('finance-weeks');
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading-state">กำลังคำนวณรายได้...</div>';

    // 1. โหลดข้อมูลทั้งหมดที่ต้องการในรอบเดียว
    const [coursesRes, enrollmentsRes] = await Promise.all([
        sb.from('courses').select('id, course_code, name, price').order('id'),
        sb.from('enrollments').select('id, user_id, course_code, enrolled_at'),
    ]);

    const courses     = coursesRes.data     || [];
    const enrollments = enrollmentsRes.data || [];

    if (!courses.length) {
        wrap.innerHTML = '<div class="empty-state">ยังไม่มีคอร์สในระบบ</div>';
        return;
    }

    // สร้าง price map
    const priceMap = {};
    courses.forEach(c => { priceMap[c.course_code] = c.price || 0; });

    // 2. สร้างรายการสัปดาห์ที่ต้องการ
    const weeks = buildWeekList(FINANCE_WEEKS_BACK);

    // 3. โหลด lessons เฉพาะช่วงเวลาที่ต้องการ (ol_ courses)
    const olCodes = courses.filter(c => c.course_code?.startsWith('ol_')).map(c => c.course_code);
    let olLessons = [];
    if (olCodes.length) {
        const { data } = await sb
            .from('lessons')
            .select('id, course_code, created_at')
            .in('course_code', olCodes)
            .gte('created_at', weeks[weeks.length - 1].start.toISOString())
            .lte('created_at', new Date().toISOString());
        olLessons = data || [];
    }

    // 4. นับนักเรียน ol_ ปัจจุบัน (enrollment count per course_code)
    const olEnrollCount = {};
    olCodes.forEach(code => {
        olEnrollCount[code] = enrollments.filter(e => e.course_code === code).length;
    });

    // 5. คำนวณและ render แต่ละสัปดาห์
    let html = '';
    for (const week of weeks) {
        const card = buildWeekCard(week, courses, enrollments, olLessons, olEnrollCount, priceMap);
        if (card) html += card;
    }

    wrap.innerHTML = html || '<div class="empty-state">ยังไม่มีข้อมูลการเงิน</div>';
}

// ---- สร้างรายการสัปดาห์ ----
function buildWeekList(count) {
    const weeks = [];
    const now = getWeekStart(new Date());
    for (let i = 0; i < count; i++) {
        const start = new Date(now);
        start.setDate(start.getDate() - i * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        weeks.push({ start, end, index: i });
    }
    return weeks;
}

// ---- สร้าง HTML Card สำหรับสัปดาห์ ----
function buildWeekCard(week, courses, enrollments, olLessons, olEnrollCount, priceMap) {
    const weekRows = [];

    courses.forEach(c => {
        const code  = c.course_code;
        const price = priceMap[code] || 0;

        if (code.startsWith('vd_')) {
            // วิดีโอ: นับ enrollments ในสัปดาห์นี้
            const count = enrollments.filter(e =>
                e.course_code === code &&
                isInWeek(e.enrolled_at, week)
            ).length;

            if (count > 0) {
                weekRows.push({
                    code, name: c.name,
                    type: 'vd',
                    detail: `${count} คนสมัครใหม่ × ฿${price.toLocaleString()}`,
                    amount: count * price,
                });
            }

        } else if (code.startsWith('ol_')) {
            // สอนสด: นับ lessons ที่สร้างในสัปดาห์นี้
            const lessonCount = olLessons.filter(l =>
                l.course_code === code && isInWeek(l.created_at, week)
            ).length;

            const stuCount = olEnrollCount[code] || 0;

            if (lessonCount > 0 && stuCount > 0) {
                weekRows.push({
                    code, name: c.name,
                    type: 'ol',
                    detail: `${stuCount} นักเรียน × ${lessonCount} ครั้ง × ฿${price.toLocaleString()}`,
                    amount: stuCount * lessonCount * price,
                });
            }
        }
    });

    if (!weekRows.length) return '';  // สัปดาห์ว่างไม่แสดง

    // สรุปตามประเภท
    const vdTotal = weekRows.filter(r => r.type === 'vd').reduce((s, r) => s + r.amount, 0);
    const olTotal = weekRows.filter(r => r.type === 'ol').reduce((s, r) => s + r.amount, 0);
    const grandTotal = vdTotal + olTotal;

    const isCurrentWeek = week.index === 0;
    const weekLabel = formatWeekRange(week.start, week.end);

    return `
    <div class="finance-card ${isCurrentWeek ? 'finance-card-current' : ''}">
        <div class="finance-card-header">
            <div class="finance-card-header-left">
                ${isCurrentWeek ? '<span class="badge badge-green">สัปดาห์นี้</span>' : ''}
                <span class="finance-week-label">${weekLabel}</span>
            </div>
            <div class="finance-card-total">
                <span class="finance-total-label">รายได้รวม</span>
                <span class="finance-total-amount">฿${grandTotal.toLocaleString()}</span>
            </div>
        </div>

        <table class="finance-table">
            <thead>
                <tr>
                    <th>คอร์ส</th>
                    <th>ประเภท</th>
                    <th>รายละเอียด</th>
                    <th class="text-right">รายได้</th>
                </tr>
            </thead>
            <tbody>
                ${weekRows.map(r => `
                <tr>
                    <td><span class="mono-text">${escHtml(r.code)}</span><br>
                        <span class="text-muted" style="font-size:12px;">${escHtml(r.name)}</span></td>
                    <td>${r.type === 'ol'
                        ? '<span class="badge badge-orange">สอนสด</span>'
                        : '<span class="badge badge-blue">วิดีโอ</span>'}</td>
                    <td class="text-muted" style="font-size:12px;">${r.detail}</td>
                    <td class="text-right finance-row-amount">฿${r.amount.toLocaleString()}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                ${vdTotal > 0 ? `
                <tr class="finance-subtotal">
                    <td colspan="3">รวมวิดีโอออนไลน์ <span class="badge badge-blue">vd_</span></td>
                    <td class="text-right">฿${vdTotal.toLocaleString()}</td>
                </tr>` : ''}
                ${olTotal > 0 ? `
                <tr class="finance-subtotal">
                    <td colspan="3">รวมสอนสด <span class="badge badge-orange">ol_</span></td>
                    <td class="text-right">฿${olTotal.toLocaleString()}</td>
                </tr>` : ''}
                <tr class="finance-grand-total">
                    <td colspan="3"><strong>ยอดรวมสุทธิประจำสัปดาห์</strong></td>
                    <td class="text-right"><strong>฿${grandTotal.toLocaleString()}</strong></td>
                </tr>
            </tfoot>
        </table>
    </div>`;
}

// ---- Helpers ----
function isInWeek(isoString, week) {
    if (!isoString) return false;
    const d = new Date(isoString);
    return d >= week.start && d <= week.end;
}

function getWeekStart(date) {
    const d   = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatWeekRange(start, end) {
    const opts = { day: 'numeric', month: 'short' };
    const optsFull = { day: 'numeric', month: 'short', year: 'numeric' };
    return start.toLocaleDateString('th-TH', opts)
         + ' — '
         + end.toLocaleDateString('th-TH', optsFull);
}