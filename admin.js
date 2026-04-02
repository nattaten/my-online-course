// ตรวจสอบการเชื่อมต่อ Supabase (ใช้ Config เดิมของคุณ)
const SUPABASE_URL = 'https://zbekvirvhahjtocnitaq.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_dQSimAG7mP174RrY6Ws1VQ_oMcFQbY9';
const { createClient } = supabase; 
const _supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// เรียกใช้งานทันทีเมื่อโหลดหน้า
window.onload = function() {
    console.log("หน้าเว็บโหลดเสร็จแล้ว เริ่มโหลดคอร์ส...");
    loadCourseDropdown();
};


async function loadCourseDropdown() {
    // ดึงค่ามาทั้ง 2 Dropdown
    const deleteDropdown = document.getElementById('course-dropdown');
    const videoDropdown = document.getElementById('video-course-select');
    
    if (!deleteDropdown || !videoDropdown) return;

    const { data, error } = await _supabaseClient
        .from('courses')
        .select('*')
        .order('id', { ascending: true });

    if (error) return;

    let options = '<option value="">-- เลือกคอร์สเรียน --</option>';
    data.forEach(course => {
        options += `<option value="${course.name}">${course.name}</option>`;
    });

    deleteDropdown.innerHTML = options;
    videoDropdown.innerHTML = options;
}

// --- 2. ฟังก์ชันเพิ่มคอร์สใหม่ ลงในตาราง 'courses' ---
async function addCourse() {
    const nameInput = document.getElementById('new-course-name');
    const courseName = nameInput.value.trim();

    if (!courseName) {
        alert("กรุณากรอกชื่อคอร์ส");
        return;
    }

    const { error } = await _supabaseClient
        .from('courses')
        .insert([{ name: courseName }]);

    if (error) {
        alert("เพิ่มคอร์สไม่สำเร็จ: " + error.message);
    } else {
        alert("เพิ่มคอร์ส '" + courseName + "' เรียบร้อยแล้ว");
        nameInput.value = "";
        loadCourseDropdown(); // อัปเดต Dropdown ทันที
    }
}

// --- 3. ฟังก์ชันบันทึกวิดีโอลงในตาราง 'lessons' ---
async function saveLesson() {
    const saveBtn = document.querySelector('button[onclick="saveLesson()"]');
    
    // ดึงค่าจากฟอร์ม
    const courseName = document.getElementById('course-dropdown').value;
    const topicName = document.getElementById('topic-name').value.trim();
    const lessonTitle = document.getElementById('lesson-title').value.trim();
    const videoId = document.getElementById('video-id').value.trim();
    const orderNo = document.getElementById('order-no').value;

    // ตรวจสอบข้อมูลเบื้องต้น
    if (!courseName || !lessonTitle || !videoId) {
        alert("กรุณากรอกข้อมูลให้ครบ (เลือกคอร์ส, ชื่อคลิป และ ID วิดีโอ)");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerText = "กำลังบันทึก...";

    const lessonData = {
        course_name: courseName,
        topic_name: topicName || "ทั่วไป", // ถ้าไม่ใส่เรื่อง ให้ใส่ว่าทั่วไป
        lesson_title: lessonTitle,
        vimeo_id: videoId,
        order_no: parseInt(orderNo) || 1
    };

    const { error } = await _supabaseClient
        .from('lessons')
        .insert([lessonData]);

    if (error) {
        alert("เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    } else {
        alert("บันทึกบทเรียนสำเร็จ!");
        // ล้างค่าในฟอร์ม (ยกเว้นคอร์สและหัวข้อ เพื่อให้เพิ่มคลิปต่อไปในเรื่องเดิมได้ไวขึ้น)
        document.getElementById('lesson-title').value = "";
        document.getElementById('video-id').value = "";
        document.getElementById('order-no').value = parseInt(orderNo) + 1; // รันเลขลำดับถัดไปให้เลย
    }

    saveBtn.disabled = false;
    saveBtn.innerText = "บันทึกวิดีโอ";
}

// --- 4. (แถม) ฟังก์ชันลบคอร์ส (ถ้าต้องการ) ---
async function deleteCourse() {
    const dropdown = document.getElementById('course-dropdown');
    const courseName = dropdown.value;

    if (!courseName) {
        alert("โปรดเลือกคอร์สที่ต้องการลบจากรายการก่อนครับ");
        return;
    }

    // ถามยืนยันเพื่อป้องกันการกดพลาด
    if (!confirm(`ยืนยันการลบคอร์ส: "${courseName}"? \n(หมายเหตุ: วิดีโอในตาราง lessons จะยังอยู่แต่จะไม่แสดงผล)`)) {
        return;
    }

    console.log("กำลังลบคอร์ส:", courseName);

    const { error } = await _supabaseClient
        .from('courses')
        .delete()
        .eq('name', courseName); // ตรวจสอบว่าคอลัมน์ใน Supabase ชื่อ 'name' ตรงกัน

    if (error) {
        console.error("Delete Error:", error);
        alert("ลบไม่สำเร็จ: " + error.message);
    } else {
        alert("ลบคอร์สเรียบร้อยแล้ว");
        // รีโหลด Dropdown ใหม่เพื่อให้ชื่อที่ลบหายไป
        loadCourseDropdown(); 
    }
}