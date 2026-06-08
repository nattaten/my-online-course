// ============================================================
// config.js — Math 10 10 10 Admin
// เก็บค่าการเชื่อมต่อ Supabase และค่าคอนฟิกส่วนกลาง
// ⚠️  ก่อน deploy จริง ให้เปลี่ยนค่าด้านล่างให้ตรงกับโปรเจกต์ของคุณ
//     และไม่ควร commit ไฟล์นี้ขึ้น public repository
// ============================================================

const APP_CONFIG = {
    // --- Supabase ---
    supabaseUrl:  'https://zbekvirvhahjtocnitaq.supabase.co',   // 🔑 แก้ไขก่อนใช้งาน
    supabaseKey:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZWt2aXJ2aGFoanRvY25pdGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDgzMDMsImV4cCI6MjA5MDY4NDMwM30.rM07BjG64N_jKrWcIcGovb5xtHPiPGFWKvvV2A_i9Ts',               // 🔑 แก้ไขก่อนใช้งาน

    // --- Admin Access ---
    // อีเมลที่จะได้รับสิทธิ์เข้า Admin Panel
    // auth-check.js จะเปรียบเทียบกับ Session ที่ล็อกอินมา
    adminEmails: [
        'nattaten@gmail.com',   // 🔑 แก้เป็นอีเมลแอดมินจริง
    ],   // 🔑 เปลี่ยนเป็นรหัสผ่านจริง,

    // --- App Meta ---
    appName:    'Math 10 10 10',
    version:    '2.0.0',
};

// สร้าง Supabase Client (ต้องโหลด supabase-js ก่อน)
// ตัวแปร `sb` จะใช้ร่วมกันทุกโมดูล
const sb = window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
