const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_dQSimAG7mP174RrY6Ws1VQ_oMcFQbY9';
const { createClient } = supabase; 
const _supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const loginBtn = document.getElementById('login-btn');

loginBtn.addEventListener('click', async () => {
    console.log("กำลังพยายาม Login ด้วย:", email, password);
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorMsg = document.getElementById('error-msg');

    if (!email || !password) {
        alert("กรุณากรอกข้อมูลให้ครบ");
        return;
    }

    errorMsg.innerText = "กำลังตรวจสอบ...";

    try {
        const { data: user, error: authError } = await _supabaseClient
            .from('users_courses') 
            .select('*') 
            .eq('email', email)
            .eq('password', password)
            .single();

        if (authError || !user) {
            errorMsg.innerText = "อีเมลหรือรหัสผ่านผิด";
            return;
        }

        const myCourse = user.course_name; 
        const { data: lessons, error: lessonError } = await _supabaseClient
            .from('lessons')
            .select('*')
            .eq('course_name', myCourse)
            .order('order_no', { ascending: true });

        if (lessonError) {
            errorMsg.innerText = "ดึงบทเรียนไม่ได้";
        } else {
            showVideoPage(user, lessons);
        }

    } catch (err) {
        errorMsg.innerText = "เกิดข้อผิดพลาด: " + err.message;
    }
});

function showVideoPage(userData, lessons) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('video-section').style.display = 'block';
    document.getElementById('course-title').innerText = "คอร์ส: " + userData.course_name;

    const playerWrapper = document.getElementById('player-wrapper');
    if (!lessons || lessons.length === 0) {
        playerWrapper.innerHTML = "<p>ไม่พบวิดีโอในบทเรียนนี้</p>";
        return;
    }

    let playlistHTML = '';
    let currentTopic = "";

    lessons.forEach((item) => {
        if (item.topic_name && item.topic_name !== currentTopic) {
            currentTopic = item.topic_name;
            playlistHTML += `<h3 style="margin: 25px 0 10px 5px; color: #0369a1; font-size: 18px;">📁 ${currentTopic}</h3>`;
        }
        playlistHTML += `
            <button class="lesson-btn" onclick="changeVideo('${item.vimeo_id}', '${item.pdf_url || ""}', this)">
                <span style="margin-right: 10px;">▶️</span>
                ${item.lesson_title}
            </button>
        `;
    });

    const firstId = lessons[0].vimeo_id;
    const firstPdf = lessons[0].pdf_url || "";
    let firstSrc = (isNaN(firstId) && firstId.length === 11) 
        ? `https://www.youtube.com/embed/${firstId}` 
        : `https://player.vimeo.com/video/${firstId}`;

    // แสดงผลวิดีโอและ playlist
    playerWrapper.innerHTML = `
        <div class="video-container" style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; background:#000;">
            <iframe id="main-player" src="${firstSrc}" 
            style="position:absolute; top:0; left:0; width:100%; height:100%;" 
            frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>
        </div>
        <div class="playlist" style="margin-top: 20px;">
            ${playlistHTML}
        </div>
    `;

    // อัปเดต PDF ของวิดีโอตัวแรก
    updatePdfButton(firstPdf);
}

window.changeVideo = function(id, pdfUrl, btnElement) {
    const iframe = document.getElementById('main-player');
    document.querySelectorAll('.lesson-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');

    let videoSrc = (isNaN(id) && id.length === 11) 
        ? `https://www.youtube.com/embed/${id}?autoplay=1` 
        : `https://player.vimeo.com/video/${id}?autoplay=1`;
    iframe.src = videoSrc;

    updatePdfButton(pdfUrl);
};

function updatePdfButton(url) {
    const container = document.getElementById('pdf-container');
    container.innerHTML = ""; // ล้างค่าเก่า

    if (url && url.trim() !== "" && url !== "null") {
        const links = url.split(',');
        const groupDiv = document.createElement('div');
        groupDiv.style.marginTop = "15px";

        links.forEach((link, index) => {
            const trimmedLink = link.trim();
            if (trimmedLink && trimmedLink.startsWith('http')) {
                const pdfBox = document.createElement('div');
                pdfBox.className = 'pdf-box';
                pdfBox.style.marginBottom = "10px";
                pdfBox.innerHTML = `
                    <span class="pdf-text">📄 เอกสารประกอบเรียน (${index + 1})</span>
                    <a href="${trimmedLink}" target="_blank" class="pdf-link">เปิดไฟล์เรียน</a>
                `;
                groupDiv.appendChild(pdfBox);
            }
        });
        container.appendChild(groupDiv);
    }
}

document.getElementById('logout-btn').addEventListener('click', () => location.reload());