// ============================================================
// overview.js — ภาพรวมระบบ (Stats + Recent Students)
// ใช้ตาราง: courses, lessons, users, enrollments
// ============================================================

async function loadOverview() {
    await Promise.all([loadStats(), loadRecentStudents()]);
}

// ---- สถิติหลัก ----
async function loadStats() {
    const [
        { count: courseCount },
        { count: lessonCount },
        { count: studentCount },
    ] = await Promise.all([
        sb.from('courses').select('id', { count: 'exact', head: true }),
        sb.from('lessons').select('id', { count: 'exact', head: true }),
        sb.from('users').select('id',   { count: 'exact', head: true }),
    ]);

    safeSetText('stat-courses',  courseCount  ?? '—');
    safeSetText('stat-lessons',  lessonCount  ?? '—');
    safeSetText('stat-students', studentCount ?? '—');

    // นักเรียนใหม่วันนี้
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await sb
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());

    safeSetText('stat-new-today', todayCount ?? '0');

    // รายได้สัปดาห์นี้ (จาก enrollments + ราคาคอร์ส)
    const weekStart = getWeekStart(new Date());
    const { data: weekEnrollments } = await sb
        .from('enrollments')
        .select('course_code, enrolled_at')
        .gte('enrolled_at', weekStart.toISOString());

    if (weekEnrollments?.length && window._allCourses?.length) {
        const priceMap = {};
        window._allCourses.forEach(c => { priceMap[c.course_code] = c.price || 0; });
        const weekIncome = weekEnrollments
            .filter(e => e.course_code?.startsWith('vd_'))
            .reduce((sum, e) => sum + (priceMap[e.course_code] || 0), 0);
        safeSetText('stat-week-income', '฿' + weekIncome.toLocaleString());
    } else {
        safeSetText('stat-week-income', '฿0');
    }
}

// ---- นักเรียนล่าสุด ----
async function loadRecentStudents() {
    const { data } = await sb
        .from('users')
        .select('id, name, email, phone, level, created_at')
        .order('created_at', { ascending: false })
        .limit(8);

    const el = document.getElementById('recent-students');
    if (!el) return;

    if (!data?.length) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีนักเรียน</div>';
        return;
    }

    el.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>ชื่อ</th>
                    <th>อีเมล</th>
                    <th>เบอร์โทร</th>
                    <th>ระดับ</th>
                    <th>เพิ่มเมื่อ</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(s => `
                <tr>
                    <td>${escHtml(s.name || '—')}</td>
                    <td class="mono-text">${escHtml(s.email || '—')}</td>
                    <td class="mono-text">${escHtml(s.phone || '—')}</td>
                    <td>${s.level ? `<span class="badge badge-purple">${escHtml(s.level)}</span>` : '—'}</td>
                    <td class="text-muted">${formatDateShort(s.created_at)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

// ---- Helpers ----
function getWeekStart(date) {
    const d   = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatDateShort(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('th-TH', {
        day: 'numeric', month: 'short', year: '2-digit',
    });
}