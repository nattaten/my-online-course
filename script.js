const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_dQSimAG7mP174RrY6Ws1VQ_oMcFQbY9';
const { createClient } = supabase; 
const _supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const loginBtn = document.getElementById('login-btn');

loginBtn.addEventListener('click', async () => {
    // ดึงค่า Element มาก่อน
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const errorMsg = document.getElementById('error-msg');

    // ตรวจสอบว่ามีช่องกรอกไหม
    if (!emailEl || !passEl) return;

    const email = emailEl.value.trim();
    const password = passEl.value.trim();

    // ตอนนี้ใช้ email ได้แล้ว เพราะประกาศตัวแปรไปแล้วข้างบน
    console.log("พยายามเข้าสู่ระบบ...");

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

        const { data: lessons, error: lessonError } = await _supabaseClient
            .from('lessons')
            .select('*')
            .eq('course_name', user.course_name)
            .order('order_no', { ascending: true });

        if (lessonError) {
            errorMsg.innerText = "ดึงข้อมูลล้มเหลว";
        } else {
            showVideoPage(user, lessons);
        }
    } catch (err) {
        errorMsg.innerText = "ข้อผิดพลาด: " + err.message;
    }
});

function showVideoPage(userData, lessons) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('video-section').style.display = 'block';
    document.getElementById('course-title').innerText = "คอร์ส: " + userData.course_name;

    const playerWrapper = document.getElementById('player-wrapper');
    if (!lessons || lessons.length === 0) {
        playerWrapper.innerHTML = "<p>ไม่พบวิดีโอ</p>";
        return;
    }

    let playlistHTML = '';
    let currentTopic = "";
    lessons.forEach((item) => {
        if (item.topic_name && item.topic_name !== currentTopic) {
            currentTopic = item.topic_name;
            playlistHTML += `<h3 style="margin:20px 0 10px; color:#0369a1;">📁 ${currentTopic}</h3>`;
        }
        playlistHTML += `<button class="lesson-btn" onclick="changeVideo('${item.vimeo_id}', '${item.pdf_url || ""}', this)">▶️ ${item.lesson_title}</button>`;
    });

    const fId = lessons[0].vimeo_id;
    const fPdf = lessons[0].pdf_url || "";
    let fSrc = (isNaN(fId) && fId.length === 11) ? `https://www.youtube.com/embed/${fId}` : `https://player.vimeo.com/video/${fId}`;

    playerWrapper.innerHTML = `
        <div class="video-container" style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; background:#000;">
            <iframe id="main-player" src="${fSrc}" style="position:absolute; top:0; left:0; width:100%; height:100%;" frameborder="0" allowfullscreen></iframe>
        </div>
        <div class="playlist" style="margin-top:20px;">${playlistHTML}</div>`;
    updatePdfButton(fPdf);
}

window.changeVideo = function(id, pdfUrl, btnElement) {
    const iframe = document.getElementById('main-player');
    document.querySelectorAll('.lesson-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    iframe.src = (isNaN(id) && id.length === 11) ? `https://www.youtube.com/embed/${id}?autoplay=1` : `https://player.vimeo.com/video/${id}?autoplay=1`;
    updatePdfButton(pdfUrl);
};

function updatePdfButton(url) {
    const container = document.getElementById('pdf-container');
    if (!container) return;
    container.innerHTML = ""; 
    if (url && url.trim() !== "" && url !== "null") {
        const links = url.split(',');
        const group = document.createElement('div');
        group.style.marginTop = "15px";
        links.forEach((link, i) => {
            const tLink = link.trim();
            if (tLink.startsWith('http')) {
                const box = document.createElement('div');
                box.className = 'pdf-box';
                box.style.marginBottom = "10px";
                box.innerHTML = `<span class="pdf-text">📄 เอกสารเรียน (${i+1})</span><a href="${tLink}" target="_blank" class="pdf-link">เปิดไฟล์</a>`;
                group.appendChild(box);
            }
        });
        container.appendChild(group);
    }
}
document.getElementById('logout-btn').addEventListener('click', () => location.reload());