// ตรวจสอบว่าไฟล์ JS เชื่อมต่อสำเร็จไหม
console.log("1. script.js เริ่มการทำงานแล้ว!");

const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_dQSimAG7mP174RrY6Ws1VQ_oMcFQbY9';

if (typeof supabase === 'undefined') {
    console.error("2. หา Library Supabase ไม่เจอ!");
} else {
    console.log("2. Library Supabase พร้อมใช้งาน");
}

const { createClient } = supabase; 
const _supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const loginBtn = document.getElementById('login-btn');

if (loginBtn) {
    console.log("3. หาปุ่ม login-btn เจอแล้ว");
}

loginBtn.addEventListener('click', async () => {
    console.log("4. ปุ่มถูกกดแล้ว!");
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

        // ใช้ชื่อคอลัมน์ course_name ตามรูปฐานข้อมูลล่าสุดของคุณ
        const myCourse = user.course_name; 
        console.log("6. Login ผ่าน! คอร์สคือ:", myCourse);

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
    
    // ตรวจสอบชื่อคอลัมน์ให้ตรงกับที่ใช้ (course_name หรือ users_courses)
    const displayCourseName = userData.course_name || userData.users_courses;
    document.getElementById('course-title').innerText = "คอร์ส: " + displayCourseName;

    const playerWrapper = document.getElementById('player-wrapper');
    
    if (!lessons || lessons.length === 0) {
        playerWrapper.innerHTML = "<p>ไม่พบวิดีโอในบทเรียนนี้</p>";
        return;
    }

    // 1. สร้าง HTML สำหรับ Playlist แบบแยกหมวดหมู่ (Topic)
    let playlistHTML = '';
    let currentTopic = "";

    lessons.forEach((item, index) => {
        // ถ้าขึ้นหัวข้อเรื่องใหม่ (และต้องไม่เป็นค่าว่าง)
        if (item.topic_name && item.topic_name !== currentTopic) {
            currentTopic = item.topic_name;
            playlistHTML += `<h3 style="margin: 25px 0 10px 5px; color: #0369a1; font-size: 18px;">📁 ${currentTopic}</h3>`;
        }

        playlistHTML += `
            <button class="lesson-btn" onclick="changeVideo('${item.vimeo_id}', this)">
                <span style="margin-right: 10px;">▶️</span>
                ${item.lesson_title}
            </button>
        `;
    });

    // 2. เช็ควิดีโอตัวแรกเพื่อสร้าง URL
    const firstId = lessons[0].vimeo_id;
    let firstSrc = "";
    if (isNaN(firstId) && firstId.length === 11) { 
        firstSrc = `https://www.youtube.com/embed/${firstId}`;
    } else {
        firstSrc = `https://player.vimeo.com/video/${firstId}`;
    }

    // 3. แสดงผลรวมกันครั้งเดียว (วิดีโออยู่บน Playlist อยู่ล่าง)
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
}


// ฟังก์ชันเปลี่ยนวิดีโอ (รองรับทั้ง YouTube และ Vimeo)
window.changeVideo = function(id, btnElement) {
    const iframe = document.getElementById('main-player');
    
    // ลบ class active จากปุ่มอื่น
    document.querySelectorAll('.lesson-btn').forEach(btn => btn.classList.remove('active'));
    // เพิ่ม class active ให้ปุ่มที่กด
    if(btnElement) btnElement.classList.add('active');

    let videoSrc = (isNaN(id) && id.length === 11) 
        ? `https://www.youtube.com/embed/${id}?autoplay=1` 
        : `https://player.vimeo.com/video/${id}?autoplay=1`;

    iframe.src = videoSrc;
};

document.getElementById('logout-btn').addEventListener('click', () => location.reload());