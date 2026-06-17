// ============================================================
// face-auth.js - AI Face Recognition Auth Module
// Uses face-api.js (TensorFlow.js) for client-side face matching
// ============================================================

(function () {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    const STORAGE_KEY = 'math_admin_face_auth';
    let modelsLoaded = false;
    let registerStream = null;
    let detectionInterval = null;
    let tempDescriptor = null;

    // --- Simple local encryption / obfuscation helper ---
    function encrypt(text) {
        const key = "Math101010SecureKey";
        let result = "";
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(unescape(encodeURIComponent(result)));
    }

    function decrypt(obfuscated) {
        const key = "Math101010SecureKey";
        try {
            const text = decodeURIComponent(escape(atob(obfuscated)));
            let result = "";
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (e) {
            return "";
        }
    }

    // --- Load Models from CDN ---
    async function loadModels() {
        if (modelsLoaded) return;
        try {
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
            await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
            modelsLoaded = true;
            console.log("Face-API models loaded successfully.");
        } catch (e) {
            console.error("Failed to load Face-API models:", e);
            throw new Error("ไม่สามารถโหลดโมเดล AI ได้ กรุณาเชื่อมต่ออินเทอร์เน็ต");
        }
    }

    // --- Open Registration Modal ---
    window.openFaceRegisterModal = async function () {
        const modal = document.getElementById('face-register-modal');
        const statusEl = document.getElementById('face-register-status');
        const captureBtn = document.getElementById('face-capture-btn');
        const passwordField = document.getElementById('face-password-field');
        const msgEl = document.getElementById('face-register-msg');
        const passInput = document.getElementById('face-confirm-password');

        if (msgEl) msgEl.textContent = '';
        if (passInput) passInput.value = '';
        if (passwordField) passwordField.style.display = 'none';
        if (captureBtn) {
            captureBtn.disabled = true;
            captureBtn.textContent = '📷 รอตรวจจับใบหน้า...';
        }
        if (modal) modal.style.display = 'flex';

        try {
            if (statusEl) statusEl.textContent = 'กำลังโหลดโมเดล AI...';
            await loadModels();
            if (statusEl) statusEl.textContent = 'กำลังเริ่มต้นกล้อง...';

            registerStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480, facingMode: 'user' } 
            });
            const video = document.getElementById('register-video');
            if (video) {
                video.srcObject = registerStream;
                video.onloadedmetadata = () => {
                    video.play();
                    startFaceDetectionLoop(video, statusEl, captureBtn, passwordField);
                };
            }
        } catch (err) {
            if (statusEl) statusEl.textContent = 'เกิดข้อผิดพลาด';
            if (msgEl) msgEl.textContent = err.message || 'ไม่สามารถเปิดกล้องได้';
        }
    };

    // --- Stop & Close Registration ---
    window.closeFaceRegisterModal = function () {
        const modal = document.getElementById('face-register-modal');
        if (modal) modal.style.display = 'none';

        if (detectionInterval) {
            clearInterval(detectionInterval);
            detectionInterval = null;
        }

        if (registerStream) {
            registerStream.getTracks().forEach(track => track.stop());
            registerStream = null;
        }

        const video = document.getElementById('register-video');
        if (video) video.srcObject = null;
        tempDescriptor = null;
    };

    // --- Loop to detect face inside the frame ---
    function startFaceDetectionLoop(video, statusEl, captureBtn, passwordField) {
        if (detectionInterval) clearInterval(detectionInterval);
        
        detectionInterval = setInterval(async () => {
            if (!video || video.paused || video.ended) return;
            
            const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.65 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                tempDescriptor = detection.descriptor;
                if (statusEl) statusEl.textContent = 'ตรวจพบใบหน้าแล้ว! กรุณากรอกรหัสผ่านเพื่อบันทึก';
                if (passwordField) passwordField.style.display = 'block';
                if (captureBtn) {
                    captureBtn.disabled = false;
                    captureBtn.textContent = '📷 บันทึกใบหน้า';
                }
            } else {
                tempDescriptor = null;
                if (statusEl) statusEl.textContent = 'กรุณามองตรงมาที่กล้อง และอยู่ในกรอบสแกน';
                if (captureBtn) {
                    captureBtn.disabled = true;
                    captureBtn.textContent = '📷 รอตรวจจับใบหน้า...';
                }
            }
        }, 800);
    }

    // --- Capture & Save Face Profile ---
    window.captureFaceAndRegister = async function () {
        const msgEl = document.getElementById('face-register-msg');
        const passInput = document.getElementById('face-confirm-password');
        const captureBtn = document.getElementById('face-capture-btn');
        const password = passInput?.value || '';

        if (!tempDescriptor) {
            showMsg(msgEl, 'ไม่พบตำแหน่งใบหน้าในขณะนี้ กรุณามองตรงมาที่กล้อง', 'error');
            return;
        }
        if (!password) {
            showMsg(msgEl, 'กรุณากรอกรหัสผ่านเพื่อยืนยันสิทธิ์ผู้ดูแลระบบ', 'error');
            return;
        }

        try {
            if (captureBtn) {
                captureBtn.disabled = true;
                captureBtn.textContent = 'กำลังตรวจสอบสิทธิ์...';
            }
            if (msgEl) msgEl.textContent = '';

            // Verify password using Supabase Auth
            const email = window._adminSession?.user?.email;
            if (!email) throw new Error("ไม่พบเซสชันของผู้ดูแลระบบ กรุณาล็อกอินใหม่");

            const { error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw new Error("รหัสผ่านไม่ถูกต้อง ยืนยันตัวตนล้มเหลว");

            // Save to localStorage
            const newProfile = {
                email: email,
                descriptor: Array.from(tempDescriptor),
                encryptedPass: encrypt(password),
                createdAt: new Date().toISOString()
            };

            let profiles = [];
            try {
                profiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            } catch (e) {
                profiles = [];
            }

            profiles.push(newProfile);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));

            showMsg(msgEl, '✅ ลงทะเบียนใบหน้าสำเร็จ!', 'success');
            setTimeout(() => {
                window.closeFaceRegisterModal();
            }, 1000);

        } catch (err) {
            showMsg(msgEl, err.message || 'บันทึกล้มเหลว', 'error');
            if (captureBtn) {
                captureBtn.disabled = false;
                captureBtn.textContent = '📷 ลงทะเบียนใบหน้า';
            }
        }
    };

    // --- Face Recognition Login Logic ---
    let loginStream = null;
    let loginDetectionInterval = null;

    window.toggleFaceLogin = async function (btn) {
        const webcamArea = document.getElementById('login-webcam-area');
        const loginForm = document.getElementById('admin-login-form');
        const errEl = document.getElementById('admin-login-error');

        if (!webcamArea) return;

        // If it's already open, close it
        if (webcamArea.style.display === 'block') {
            stopLoginScan();
            btn.innerHTML = '📷 สแกนใบหน้าเข้าระบบ';
            return;
        }

        // Check if there are any face profiles registered
        let profiles = [];
        try {
            profiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            profiles = [];
        }

        if (!profiles || profiles.length === 0) {
            if (errEl) errEl.textContent = 'ยังไม่ได้ลงทะเบียนใบหน้าสำหรับเครื่องนี้ กรุณาล็อกอินด้วยรหัสผ่านและลงทะเบียนก่อน';
            return;
        }

        if (errEl) errEl.textContent = '';
        webcamArea.style.display = 'block';
        btn.innerHTML = '❌ ยกเลิกสแกนใบหน้า';

        const video = document.getElementById('login-video');
        const statusText = document.getElementById('login-scan-status');

        try {
            if (statusText) statusText.textContent = 'กำลังโหลดโมเดล AI...';
            await loadModels();
            if (statusText) statusText.textContent = 'กำลังเริ่มต้นกล้อง...';

            loginStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 480, height: 360, facingMode: 'user' }
            });

            if (video) {
                video.srcObject = loginStream;
                video.onloadedmetadata = () => {
                    video.play();
                    startLoginScanLoop(video, statusText, profiles);
                };
            }
        } catch (err) {
            if (statusText) statusText.textContent = 'เปิดกล้องไม่ได้';
            if (errEl) errEl.textContent = err.message || 'เกิดข้อผิดพลาดในการเปิดกล้อง';
            stopLoginScan();
            btn.innerHTML = '📷 สแกนใบหน้าเข้าระบบ';
        }
    };

    function startLoginScanLoop(video, statusText, profiles) {
        if (loginDetectionInterval) clearInterval(loginDetectionInterval);

        loginDetectionInterval = setInterval(async () => {
            if (!video || video.paused || video.ended) return;

            if (statusText) statusText.textContent = 'กำลังค้นหาใบหน้า...';

            const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.65 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                if (statusText) statusText.textContent = 'กำลังสแกนวิเคราะห์...';
                
                const scannedDescriptor = detection.descriptor;
                let bestMatch = null;
                let minDistance = 99.0;

                profiles.forEach(profile => {
                    const savedDescriptor = new Float32Array(profile.descriptor);
                    const distance = faceapi.euclideanDistance(scannedDescriptor, savedDescriptor);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestMatch = profile;
                    }
                });

                // Match Threshold is typically 0.55 for security and accuracy
                if (bestMatch && minDistance < 0.55) {
                    if (statusText) statusText.textContent = '✅ ตรวจพบใบหน้าตรงกัน!';
                    clearInterval(loginDetectionInterval);
                    loginDetectionInterval = null;

                    const password = decrypt(bestMatch.encryptedPass);
                    if (password) {
                        // Populate login inputs
                        const emailInput = document.getElementById('admin-login-email');
                        const passInput = document.getElementById('admin-login-password');
                        if (emailInput) emailInput.value = bestMatch.email;
                        if (passInput) passInput.value = password;

                        // Auto submit form
                        setTimeout(() => {
                            stopLoginScan();
                            const form = document.getElementById('admin-login-form');
                            if (form) {
                                const event = new Event('submit', { cancelable: true });
                                form.dispatchEvent(event);
                            }
                        }, 500);
                    } else {
                        if (statusText) statusText.textContent = '❌ รหัสผ่านเสียหาย กรุณาล็อกอินใหม่';
                    }
                } else {
                    if (statusText) statusText.textContent = '❌ ใบหน้าไม่ตรงกับข้อมูลในระบบ';
                }
            } else {
                if (statusText) statusText.textContent = '❌ ไม่พบใบหน้า กรุณามองตรงมาที่กล้อง';
            }
        }, 850);
    }

    function stopLoginScan() {
        if (loginDetectionInterval) {
            clearInterval(loginDetectionInterval);
            loginDetectionInterval = null;
        }
        if (loginStream) {
            loginStream.getTracks().forEach(track => track.stop());
            loginStream = null;
        }
        const video = document.getElementById('login-video');
        if (video) video.srcObject = null;

        const webcamArea = document.getElementById('login-webcam-area');
        if (webcamArea) webcamArea.style.display = 'none';
    }

    window.stopFaceLoginScan = stopLoginScan;

})();
