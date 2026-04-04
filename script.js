// แก้ไขฟังก์ชันแสดงหน้าวิดีโอ
function showVideoPage(userData, lessons) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('video-section').style.display = 'block';
    
    const displayCourseName = userData.course_name;
    document.getElementById('course-title').innerText = "คอร์ส: " + displayCourseName;

    const playerWrapper = document.getElementById('player-wrapper');
    
    if (!lessons || lessons.length === 0) {
        playerWrapper.innerHTML = "<p>ไม่พบวิดีโอในบทเรียนนี้</p>";
        return;
    }

    // 1. สร้าง Playlist (ส่งค่า pdf_url เข้าไปด้วย)
    let playlistHTML = '';
    let currentTopic = "";

    lessons.forEach((item) => {
        if (item.topic_name && item.topic_name !== currentTopic) {
            currentTopic = item.topic_name;
            playlistHTML += `<h3 style="margin: 25px 0 10px 5px; color: #0369a1; font-size: 18px;">📁 ${currentTopic}</h3>`;
        }

        // เพิ่มการส่งค่า item.pdf_url เข้าไปใน function changeVideo
        playlistHTML += `
            <button class="lesson-btn" onclick="changeVideo('${item.vimeo_id}', '${item.pdf_url || ""}', this)">
                <span style="margin-right: 10px;">▶️</span>
                ${item.lesson_title}
            </button>
        `;
    });

    // 2. ตั้งค่าเริ่มต้น (วิดีโอตัวแรก)
    const firstId = lessons[0].vimeo_id;
    const firstPdf = lessons[0].pdf_url || "";
    let firstSrc = (isNaN(firstId) && firstId.length === 11) 
        ? `https://www.youtube.com/embed/${firstId}` 
        : `https://player.vimeo.com/video/${firstId}`;

    // 3. แสดงผลพร้อมช่อง PDF Container
    playerWrapper.innerHTML = `
        <div class="video-container" style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; background:#000;">
            <iframe id="main-player" src="${firstSrc}" 
            style="position:absolute; top:0; left:0; width:100%; height:100%;" 
            frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>
        </div>
        
        <div id="pdf-container" style="margin-top: 15px;"></div>

        <div class="playlist" style="margin-top: 20px;">
            ${playlistHTML}
        </div>
    `;

    // เรียกแสดง PDF ของวิดีโอแรกทันที
    if(firstPdf) updatePdfButton(firstPdf);
}

// ฟังก์ชันเปลี่ยนวิดีโอ (เพิ่มการรับค่า pdfUrl)
window.changeVideo = function(id, pdfUrl, btnElement) {
    const iframe = document.getElementById('main-player');
    
    document.querySelectorAll('.lesson-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');

    let videoSrc = (isNaN(id) && id.length === 11) 
        ? `https://www.youtube.com/embed/${id}?autoplay=1` 
        : `https://player.vimeo.com/video/${id}?autoplay=1`;

    iframe.src = videoSrc;

    // อัปเดตปุ่ม PDF
    updatePdfButton(pdfUrl);
};

// ฟังก์ชันสำหรับอัปเดตปุ่ม PDF (รองรับหลายไฟล์โดยคั่นด้วยเครื่องหมาย ,)
function updatePdfButton(url) {
    const container = document.getElementById('pdf-container');
    
    // ล้างข้อมูลเก่าออกก่อน
    container.innerHTML = "";

    if (url && url !== "" && url !== "null") {
        // แยกลิงก์ออกมาเป็น Array โดยใช้ , เป็นตัวแบ่ง
        const links = url.split(',');

        // สร้างกล่องครอบสำหรับกลุ่มไฟล์
        const groupDiv = document.createElement('div');
        groupDiv.style.display = "flex";
        groupDiv.style.direction = "column"; // เรียงจากบนลงล่าง
        groupDiv.style.flexDirection = "column";
        groupDiv.style.gap = "10px";
        groupDiv.style.marginTop = "15px";

        links.forEach((link, index) => {
            const trimmedLink = link.trim(); // ตัดช่องว่างหน้า-หลังลิงก์ออก
            
            if (trimmedLink) {
                // สร้าง HTML ของแต่ละปุ่ม
                const pdfBox = document.createElement('div');
                pdfBox.className = 'pdf-box';
                pdfBox.innerHTML = `
                    <span class="pdf-text">📄 เอกสารประกอบการเรียนที่ ${index + 1}</span>
                    <a href="${trimmedLink}" target="_blank" class="pdf-link">เปิดไฟล์</a>
                `;
                groupDiv.appendChild(pdfBox);
            }
        });

        container.appendChild(groupDiv);
    }
}