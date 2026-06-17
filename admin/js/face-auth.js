// ============================================================
// face-auth.js - AI Face Recognition Auth Module with Liveness Check
// Uses face-api.js (TensorFlow.js) for client-side face matching and blink detection
// ============================================================

(function () {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    const STORAGE_KEY = 'math_admin_face_auth';
    let modelsLoaded = false;
    let registerStream = null;
    let detectionInterval = null;
    let tempDescriptor = null;

    // --- Liveness state tracking ---
    let regLivenessState = null;

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

    // --- Liveness Detection Mathematical Helpers ---
    function getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }

    function getEyeAspectRatio(eye) {
        const p1 = eye[0];
        const p2 = eye[1];
        const p3 = eye[2];
        const p4 = eye[3];
        const p5 = eye[4];
        const p6 = eye[5];

        const vertical1 = getDistance(p2, p6);
        const vertical2 = getDistance(p3, p5);
        const horizontal = getDistance(p1, p4);

        return (vertical1 + vertical2) / (2.0 * horizontal);
    }

    function getMouthAspectRatio(pts) {
        const mouthWidth = getDistance(pts[48], pts[54]);
        const mouthHeight = getDistance(pts[62], pts[66]);
        if (mouthWidth === 0) return 0;
        return mouthHeight / mouthWidth;
    }

    function getHeadSymmetryRatio(pts) {
        const nose = pts[30];
        const jawLeft = pts[0];
        const jawRight = pts[16];
        const distLeft = getDistance(nose, jawLeft);
        const distRight = getDistance(nose, jawRight);
        if (distRight === 0) return 1.0;
        return distLeft / distRight;
    }

    // --- Challenge Generator & Engine ---
    function createLivenessState() {
        const challenges = ['blink', 'mouth', 'turn_left', 'turn_right'];
        const selectedChallenge = challenges[Math.floor(Math.random() * challenges.length)];
        return {
            phase: 'center_check', // 'center_check', 'challenge_active', 'success'
            challenge: selectedChallenge,
            step: 0,
            consecutiveCenterFrames: 0,
            startTime: 0,
            blinkCount: 0,
            blinkClosedState: false,
            blinkClosedFrames: 0,
            blinkOpenFrames: 0,
            lostFrames: 0,
            statusText: 'กรุณามองตรงมาที่กล้อง เพื่อเริ่มต้นสแกน'
        };
    }

    function getChallengePrompt(challenge) {
        switch (challenge) {
            case 'blink':
                return '👉 กรุณา "กระพริบตา 2 ครั้ง" เพื่อตรวจจับการมีชีวิต';
            case 'mouth':
                return '👉 กรุณา "อ้าปากกว้าง" แล้วหุบปาก เพื่อตรวจจับการมีชีวิต';
            case 'turn_left':
                return '👉 กรุณา "หันหน้าไปทางซ้าย" เล็กน้อยแล้วหันกลับมาตรงกลาง';
            case 'turn_right':
                return '👉 กรุณา "หันหน้าไปทางขวา" เล็กน้อยแล้วหันกลับมาตรงกลาง';
            default:
                return '👉 กรุณาขยับใบหน้าตามคำสั่ง';
        }
    }

    function updateLivenessState(state, detection) {
        if (!detection) {
            state.consecutiveCenterFrames = 0;
            state.lostFrames = (state.lostFrames || 0) + 1;
            
            if (state.lostFrames > 8) { // ~1.5s grace period
                if (state.phase !== 'success') {
                    state.phase = 'center_check';
                    state.statusText = '❌ สูญเสียการตรวจจับใบหน้า กรุณามองกลับมาที่กล้อง';
                }
            } else {
                if (state.phase !== 'success') {
                    state.statusText = '⚠️ ไม่พบใบหน้าชั่วคราว กรุณามองตรงมาที่กล้อง';
                }
            }
            return state;
        }

        state.lostFrames = 0;
        const pts = detection.landmarks.positions;
        const leftEye = detection.landmarks.getLeftEye();
        const rightEye = detection.landmarks.getRightEye();

        const ear = (getEyeAspectRatio(leftEye) + getEyeAspectRatio(rightEye)) / 2;
        const mar = getMouthAspectRatio(pts);
        const sym = getHeadSymmetryRatio(pts);

        if (state.phase === 'center_check') {
            const isCentered = (sym >= 0.75 && sym <= 1.30);
            const isMouthClosed = (mar < 0.12);
            const isEyesOpen = (ear >= 0.25);

            if (isCentered && isMouthClosed && isEyesOpen) {
                state.consecutiveCenterFrames++;
                state.statusText = `⏳ กำลังตั้งค่าตำแหน่งใบหน้า... (${state.consecutiveCenterFrames}/5)`;
                if (state.consecutiveCenterFrames >= 5) {
                    state.phase = 'challenge_active';
                    state.startTime = Date.now();
                    state.step = 0;
                    state.blinkCount = 0;
                    state.blinkClosedState = false;
                    state.blinkClosedFrames = 0;
                    state.blinkOpenFrames = 0;
                    state.statusText = getChallengePrompt(state.challenge);
                }
            } else {
                state.consecutiveCenterFrames = 0;
                let tip = 'กรุณามองตรงมาที่กล้อง';
                if (!isCentered) tip = 'กรุณาขยับหน้าให้อยู่ตรงกลางกรอบ';
                else if (!isEyesOpen) tip = 'กรุณาลืมตาขึ้น';
                else if (!isMouthClosed) tip = 'กรุณาหุบปากเพื่อเตรียมสแกน';
                state.statusText = `👁️ ${tip}`;
            }
        } 
        else if (state.phase === 'challenge_active') {
            const elapsed = Date.now() - state.startTime;
            if (elapsed > 7000) {
                const challenges = ['blink', 'mouth', 'turn_left', 'turn_right'];
                state.challenge = challenges[Math.floor(Math.random() * challenges.length)];
                state.phase = 'center_check';
                state.consecutiveCenterFrames = 0;
                state.statusText = '⌛ หมดเวลาสแกน ขยับใบหน้าเริ่มใหม่อีกครั้ง...';
                return state;
            }

            const remaining = Math.max(0, Math.ceil((7000 - elapsed) / 1000));
            const timerSuffix = ` (เหลือเวลา ${remaining} วินาที)`;

            if (state.challenge === 'blink') {
                if (!state.blinkClosedState) {
                    if (ear <= 0.18) {
                        state.blinkClosedFrames++;
                        if (state.blinkClosedFrames >= 2) {
                            state.blinkClosedState = true;
                            state.blinkOpenFrames = 0;
                            state.statusText = `👁️ ตรวจพบหลับตาแล้ว! ลืมตาขึ้น...${timerSuffix}`;
                        }
                    } else {
                        state.blinkClosedFrames = 0;
                        state.statusText = `👉 กรุณา "กระพริบตา 2 ครั้ง" (ครั้งที่ ${state.blinkCount + 1})${timerSuffix}`;
                    }
                } else {
                    if (ear >= 0.24) {
                        state.blinkOpenFrames++;
                        if (state.blinkOpenFrames >= 2) {
                            state.blinkCount++;
                            state.blinkClosedState = false;
                            state.blinkClosedFrames = 0;
                            state.blinkOpenFrames = 0;
                            
                            if (state.blinkCount >= 2) {
                                state.phase = 'success';
                                state.statusText = '✨ ยืนยันใบหน้ามีชีวิตสำเร็จ!';
                            } else {
                                state.statusText = `👁️ กระพริบตาครั้งที่ 1 สำเร็จ! กระพริบตาอีกครั้ง...${timerSuffix}`;
                            }
                        }
                    } else {
                        state.blinkOpenFrames = 0;
                    }
                }
            } 
            else if (state.challenge === 'mouth') {
                if (state.step === 0) {
                    if (mar >= 0.28) {
                        state.step = 1;
                        state.statusText = `😮 อ้าปากสำเร็จ! หุบปากเพื่อยืนยัน${timerSuffix}`;
                    } else {
                        state.statusText = `👉 กรุณา "อ้าปากกว้าง" แล้วหุบปาก${timerSuffix}`;
                    }
                } else if (state.step === 1) {
                    if (mar < 0.12) {
                        state.phase = 'success';
                        state.statusText = '✨ ยืนยันใบหน้ามีชีวิตสำเร็จ!';
                    }
                }
            } 
            else if (state.challenge === 'turn_left') {
                if (state.step === 0) {
                    if (sym <= 0.52) {
                        state.step = 1;
                        state.statusText = `👈 หันซ้ายสำเร็จ! หันหน้ากลับมาตรงกลาง${timerSuffix}`;
                    } else {
                        state.statusText = `👉 กรุณา "หันหน้าไปทางซ้าย" เล็กน้อย${timerSuffix}`;
                    }
                } else if (state.step === 1) {
                    if (sym >= 0.75 && sym <= 1.30) {
                        state.phase = 'success';
                        state.statusText = '✨ ยืนยันใบหน้ามีชีวิตสำเร็จ!';
                    }
                }
            } 
            else if (state.challenge === 'turn_right') {
                if (state.step === 0) {
                    if (sym >= 1.85) {
                        state.step = 1;
                        state.statusText = `👉 หันขวาสำเร็จ! หันหน้ากลับมาตรงกลาง${timerSuffix}`;
                    } else {
                        state.statusText = `👉 กรุณา "หันหน้าไปทางขวา" เล็กน้อย${timerSuffix}`;
                    }
                } else if (state.step === 1) {
                    if (sym >= 0.75 && sym <= 1.30) {
                        state.phase = 'success';
                        state.statusText = '✨ ยืนยันใบหน้ามีชีวิตสำเร็จ!';
                    }
                }
            }
        }

        return state;
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

        // Reset liveness challenge state
        regLivenessState = createLivenessState();

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
        regLivenessState = null;
    };

    // --- Loop to detect face and check for registration challenges ---
    function startFaceDetectionLoop(video, statusEl, captureBtn, passwordField) {
        if (detectionInterval) clearInterval(detectionInterval);
        
        detectionInterval = setInterval(async () => {
            if (!video || video.paused || video.ended) return;
            
            const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.65 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                if (regLivenessState.phase !== 'success') {
                    regLivenessState = updateLivenessState(regLivenessState, detection);
                    if (statusEl) statusEl.textContent = regLivenessState.statusText;

                    if (regLivenessState.phase === 'success') {
                        tempDescriptor = detection.descriptor;
                        if (passwordField) passwordField.style.display = 'block';
                        if (captureBtn) {
                            captureBtn.disabled = false;
                            captureBtn.textContent = '📷 บันทึกใบหน้า';
                        }
                    }
                }
            } else {
                if (regLivenessState.phase !== 'success') {
                    regLivenessState = updateLivenessState(regLivenessState, null);
                    if (statusEl) statusEl.textContent = regLivenessState.statusText;
                }
            }
        }, 180); // 180ms frequency for smooth liveness tracking
    }

    // --- Capture & Save Face Profile ---
    window.captureFaceAndRegister = async function () {
        const msgEl = document.getElementById('face-register-msg');
        const passInput = document.getElementById('face-confirm-password');
        const captureBtn = document.getElementById('face-capture-btn');
        const password = passInput?.value || '';

        if (!regLivenessState || regLivenessState.phase !== 'success' || !tempDescriptor) {
            showMsg(msgEl, 'กรุณาสแกนใบหน้าและทำภารกิจเพื่อยืนยันตัวตนก่อนบันทึก', 'error');
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

    // Liveness states for login
    let matchedProfile = null;
    let loginLivenessState = null;

    window.toggleFaceLogin = async function (btn) {
        const webcamArea = document.getElementById('login-webcam-area');
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

        // Reset login states
        matchedProfile = null;
        loginLivenessState = null;

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

            const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.65 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                const scannedDescriptor = detection.descriptor;

                // STAGE 1: Face matching (find who it matches)
                if (!matchedProfile) {
                    if (statusText) statusText.textContent = 'กำลังค้นหาใบหน้า...';
                    
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

                    if (bestMatch && minDistance < 0.55) {
                        matchedProfile = bestMatch;
                        loginLivenessState = createLivenessState();
                        if (statusText) statusText.textContent = loginLivenessState.statusText;
                    } else {
                        if (statusText) statusText.textContent = '❌ ใบหน้าไม่ตรงกับข้อมูลในระบบ';
                    }
                } 
                // STAGE 2: Liveness verification (requires challenge completion)
                else {
                    const savedDescriptor = new Float32Array(matchedProfile.descriptor);
                    const distance = faceapi.euclideanDistance(scannedDescriptor, savedDescriptor);
                    if (distance > 0.60) { // Slightly higher threshold to allow minor variations while performing challenges
                        matchedProfile = null;
                        loginLivenessState = null;
                        if (statusText) statusText.textContent = '❌ หลุดตำแหน่งใบหน้า เริ่มสแกนใหม่...';
                        return;
                    }

                    loginLivenessState = updateLivenessState(loginLivenessState, detection);
                    if (statusText) statusText.textContent = loginLivenessState.statusText;

                    if (loginLivenessState.phase === 'success') {
                        clearInterval(loginDetectionInterval);
                        loginDetectionInterval = null;

                        const password = decrypt(matchedProfile.encryptedPass);
                        if (password) {
                            const emailInput = document.getElementById('admin-login-email');
                            const passInput = document.getElementById('admin-login-password');
                            if (emailInput) emailInput.value = matchedProfile.email;
                            if (passInput) passInput.value = password;

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
                            matchedProfile = null;
                            loginLivenessState = null;
                        }
                    }
                }
            } else {
                if (matchedProfile) {
                    loginLivenessState = updateLivenessState(loginLivenessState, null);
                    if (statusText) statusText.textContent = loginLivenessState.statusText;
                } else {
                    if (statusText) statusText.textContent = '❌ ไม่พบใบหน้า กรุณามองตรงมาที่กล้อง';
                }
            }
        }, 180); // 180ms loop
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

        matchedProfile = null;
        loginLivenessState = null;
    }

    window.stopFaceLoginScan = stopLoginScan;

})();
