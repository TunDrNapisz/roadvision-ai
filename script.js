let stream = null;
let map, heatLayer = null;
let heatPoints = [];
let myChart = null;
let topLocationsChartInstance = null;

const videoFeed = document.getElementById('videoFeed');
const uploadedVideo = document.getElementById('uploadedVideo');
const processedImg = document.getElementById('processedImg');
const imgPlaceholder = document.getElementById('imgPlaceholder');
const canvas = document.getElementById('captureCanvas');
const resultsDiv = document.getElementById("results");
var socket = io();

BACKEND_URL = "https://duh-phoenix-strike.ngrok-free.dev";

let lastAlertTime = 0;
let chartHistory = { labels: [], long: [], trans: [] };
let adminChart = null;
let scanInterval;


// Cari fungsi renderSavedImage dalam fail JavaScript anda
function renderSavedImage(item) {
    const container = document.getElementById('gallery-images');
    const card = document.createElement('div');
    card.className = "bg-white p-6 rounded-3xl border border-slate-100 shadow-sm";

    // KOD INI YANG AKAN MEMUNCULKAN BUTANG ITU
    card.innerHTML = `
        <div class="flex items-center gap-4">
            <img src="${item.url}" class="w-20 h-20 rounded-lg object-cover">
            <div class="flex-1">
                <h3 class="font-bold text-slate-800">${item.metadata[0]?.type || 'Defect'}</h3>
                <p class="text-xs text-slate-500">${item.timestamp || ''}</p>

                <div class="flex gap-2 mt-3">
                    <button onclick="viewDetails('${item.filename}')"
                            class="px-3 py-1 bg-blue-500 text-white text-[10px] font-bold rounded-md hover:bg-blue-600 transition">
                        View Details
                    </button>
                    <button onclick="deleteItem('${item.filename}')"
                            class="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded-md hover:bg-red-100 transition">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    `;
    container.appendChild(card);
}


async function viewDetails(filename) {
    const url = `${BACKEND_URL}/get_json/${filename}.json`;
    const fileUrl = `${BACKEND_URL}/output/${filename}`;

    // Semak sama ada fail adalah video (berdasarkan extension .mp4)
    const isVideo = filename.toLowerCase().endsWith('.mp4');

    console.log("Mencari fail di:", url);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Data tidak dijumpai");

        const data = await response.json();
        const detail = Array.isArray(data) ? data[0] : data;

        // Tentukan HTML media berdasarkan jenis fail
        const mediaHtml = isVideo
            ? `<video src="${fileUrl}" controls class="w-full h-56 object-contain bg-black rounded-2xl"></video>`
            : `<img src="${fileUrl}" alt="Defect Image" class="w-full h-56 object-contain bg-slate-100 rounded-2xl" onerror="this.src='https://via.placeholder.com/400x200?text=Image+Not+Found'">`;

        // Update Modal dengan Design Profesional
        document.getElementById('modalTitle').innerText = "Defect Analysis Report";
        document.getElementById('modalContent').innerHTML = `
            <div class="space-y-6">
                <div class="relative w-full h-56 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                   ${mediaHtml}
                    <div class="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full">
                        <span class="text-[10px] font-bold text-white uppercase tracking-widest">Defect Snapshot</span>
                    </div>
                </div>

                <div class="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div>
                        <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Defect Type</h4>
                        <p class="text-xl font-black text-slate-800 uppercase">${detail.type || "Unknown"}</p>
                    </div>
                    <div class="text-right">
                        <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</h4>
                        <p class="text-xs font-semibold text-slate-600">${detail.timestamp || '-'}</p>
                    </div>
                </div>

                <div class="grid gap-4">
                    <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <h4 class="text-[10px] font-bold text-amber-600 uppercase mb-1 flex items-center gap-1">
                            Punca (Root Cause)
                        </h4>
                        <p class="text-sm text-slate-700 leading-relaxed italic">"${detail.punca || 'Tiada maklumat'}"</p>
                    </div>

                    <div class="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                        <h4 class="text-[10px] font-bold text-blue-700 uppercase mb-1 flex items-center gap-1">
                            Solusi (Recommended Solution)
                        </h4>
                        <p class="text-sm text-blue-900 font-medium leading-relaxed">${detail.solusi || 'Tiada maklumat'}</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('detailsModal').classList.remove('hidden');
    } catch (error) {
        console.error("Ralat:", error);
        alert("Gagal memuatkan data. Fail JSON tidak dijumpai.");
    }
}

// 1. Setup Awal Graf (Chart.js)
const ctx = document.getElementById('adminBarChart').getContext('2d');
const adminBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
            {
                label: 'Transverse Crack',
                data: [0, 0, 0, 0, 0, 0, 0], // Mesti ada 7 angka
                backgroundColor: '#ef4444'
            },
            {
                label: 'Longitudinal Crack',
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: '#f59e0b'
            },
            {
                label: 'Alligator Crack',
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: '#3b82f6'
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 } } }
        },
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
        }
    }
});

async function fetchAndRefreshChart() { 
    try {
        const response = await fetch('http://192.168.1.17:5000/api/get-live-data');
        const data = await response.json();

        // Update graf dengan data yang baru anda dapat tadi
        adminBarChart.data.datasets[0].data = data.transverse_weekly;
        adminBarChart.data.datasets[1].data = data.longitudinal_weekly;
        adminBarChart.data.datasets[2].data = data.alligator_weekly;

        // Penting: Refresh graf
        adminBarChart.update();
        console.log("Graf berjaya dikemaskini!");
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

// Panggil fungsi ini sekali selepas halaman dimuatkan
fetchAndRefreshChart();


function startAutoScan() {
    const video = document.getElementById('live-stream') || document.getElementById('videoFeed'); // Ikut ID video feed anda
    const resultOverlay = document.getElementById('result-overlay');

    // Hantar setiap 1000ms (1 saat)
    scanInterval = setInterval(async () => {
        if (!video || video.paused || video.ended) return; // Pelindung jika video tak sedia

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || video.clientWidth;
        canvas.height = video.videoHeight || video.clientHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const formData = new FormData();
            formData.append("image", blob, "live_frame.jpg");

            try {
                // Pastikan BACKEND_URL anda betul (contoh: http://127.0.0.1:5000)
                const response = await fetch(`${BACKEND_URL}/detect_snapshot`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                console.log("📸 [Snapshot Scan Result]:", data);

                // ✅ PEMBAIKAN SINKRONISASI: Panggil updateUI yang betul dengan mod Live = true
                if (data && data.detections && data.detections.length > 0) {
                    updateUI(data, true);
                }
            } catch (err) {
                console.error("❌ Ralat semasa menghantar snapshot scan:", err);
            }
        }, 'image/jpeg');
    }, 1000);
}

function stopAutoScan() {
    clearInterval(scanInterval);
}

async function saveImageToDisk(file) {
    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch(`${BACKEND_URL}/save_to_disk`, {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        console.log("Saved to:", data.path);
    } catch (err) {
        console.error("Gagal simpan ke disk:", err);
    }
}

function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // 1. Panggil terus fungsi simpan ke disk (Admin Gallery)
  saveImageToDisk(file);

  // 2. Seterusnya, ubah UI
  stopCameraStream();
  imgPlaceholder.style.display = "none";
  document.getElementById('cameraContainer').classList.add('hidden');
  document.getElementById('captureBtn').classList.add('hidden');
  document.getElementById('startCamBtn').classList.remove('hidden');

  // 3. Proses deteksi
  if (file.type.startsWith('video/')) {
    uploadedVideo.src = URL.createObjectURL(file);
    uploadedVideo.classList.remove('hidden');
    processedImg.classList.add('hidden');
    sendToServer(file, "/detect_video");
  } else {
    uploadedVideo.classList.add('hidden');
    processedImg.classList.remove('hidden');
    processedImg.classList.add('opacity-0');
    sendToServer(file, "/detect");
  }
}


async function loadAdminGallery() {
    try {
        console.log("🚀 Initializing gallery load...");
        
        // 1. Fetch the list of all processed files
        const response = await fetch(`${BACKEND_URL}/get_all_outputs`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log("📥 Server data received:", data);

        // 2. Validate data format
        if (!data.images || !Array.isArray(data.images)) {
            console.error("❌ Data format error: 'data.images' is missing or not an array.");
            return;
        }

        const imageContainer = document.getElementById('gallery-images');
        const videoContainer = document.getElementById('gallery-videos');

        if (!imageContainer || !videoContainer) {
            console.error("❌ Gallery container elements missing in HTML!");
            return;
        }

        // 3. Clear existing UI and Global State
        imageContainer.innerHTML = "";
        videoContainer.innerHTML = "";
        window.allDetections = []; 

        // 4. Process each file
        for (const filename of data.images) {
            const fileUrl = `${BACKEND_URL}/output/${filename}`;
            const isVideo = filename.toLowerCase().endsWith('.mp4');

            let info = { type: 'Unknown', timestamp: 'N/A', punca: 'N/A', solusi: 'N/A', confidence: '0', location: null };
            let infoHtml = `<div class="flex items-center text-gray-400 gap-2"><p class="text-xs">No detection data found.</p></div>`;

            // 5. Fetch associated JSON metadata
            try {
                const resJson = await fetch(`${BACKEND_URL}/get_json/${filename}.json`);
                if (resJson.ok) {
                    const detections = await resJson.json();
                    const detectedInfo = Array.isArray(detections) ? detections[0] : detections;

                    if (detectedInfo) {
                        info = detectedInfo;
                        
                        // Collect location data for the chart
                        if (info.location && info.location.address) {
                            window.allDetections.push(info);
                        }

                        const conf = info.confidence ? `<span class="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Conf: ${info.confidence}%</span>` : "";
                        infoHtml = `
                            <div class="flex flex-col gap-1.5">
                                <div class="flex items-center justify-between">
                                    <h3 class="font-bold text-slate-800 text-base tracking-tight uppercase">${info.type}</h3>
                                    ${conf}
                                </div>
                                <div class="flex items-center text-[10px] text-slate-400 gap-1.5 font-medium">
                                    <span>${info.timestamp || 'N/A'}</span>
                                </div>
                                <div class="mt-2 space-y-2 border-t border-slate-100 pt-2">
                                    <div class="text-xs"><span class="block font-semibold text-slate-500 uppercase text-[9px]">Cause:</span><p class="text-slate-600 italic">"${info.punca}"</p></div>
                                    <div class="text-xs"><span class="block font-semibold text-blue-600 uppercase text-[9px]">Solution:</span><p class="text-slate-700 font-medium">${info.solusi}</p></div>
                                </div>
                            </div>`;
                    }
                }
            } catch (e) {
                console.warn(`⚠️ No JSON metadata for: ${filename}`);
            }

            // 6. Build the card
            const cardHtml = `
                <div class="bg-white p-4 border rounded-xl shadow-sm mb-4 flex gap-4 transition hover:shadow-md">
                    ${isVideo ? `<video src="${fileUrl}" controls class="w-32 h-32 rounded-lg object-cover"></video>`
                            : `<img src="${fileUrl}" class="w-32 h-32 object-cover rounded-lg">`}
                    <div class="flex-1 flex flex-col justify-between">
                        <div>${infoHtml}</div>
                        <div class="flex gap-2 mt-3">
                            <button onclick="viewDetails('${filename}')" class="text-[10px] bg-blue-500 text-white px-3 py-1 rounded-md font-semibold">Details</button>
                            <button onclick="downloadReport('${filename}', '${info.type}', '${info.timestamp}', '${info.punca}', '${info.solusi}', '${fileUrl}')" class="text-[10px] bg-slate-100 px-3 py-1 rounded-md font-semibold text-slate-600">Report</button>
                            <button onclick="deleteMedia('${filename}')" class="text-[10px] bg-red-50 px-3 py-1 rounded-md font-semibold text-red-500">Delete</button>
                        </div>
                    </div>
                </div>`;

            if (isVideo) videoContainer.innerHTML += cardHtml;
            else imageContainer.innerHTML += cardHtml;
        }

        // 7. Final Step: Sync the Chart
        console.log(`📊 Finalizing chart with ${window.allDetections.length} points.`);
        if (typeof updateLocationChart === 'function') {
            updateLocationChart(window.allDetections);
        } else {
            console.error("❌ 'updateLocationChart' function is not defined!");
        }

    } catch (err) {
        console.error("❌ Critical error in loadAdminGallery:", err);
    }
}

// Function to delete media files from the server
async function deleteMedia(filename) {
    // Prompt the user for confirmation before proceeding
    if (confirm('Are you sure you want to delete this file?')) {
        const deleteUrl = `${BACKEND_URL}/delete_media/${filename}`;
        console.log("Attempting to delete at URL:", deleteUrl); // Debugging log

        try {
            // Send DELETE request to the backend
            const response = await fetch(deleteUrl, { method: 'DELETE' });

            // Parse server response
            const result = await response.json().catch(() => ({}));
            console.log("Server response:", result); // Debugging log

            if (response.ok) {
                alert("File successfully deleted.");
                // Refresh the gallery display after successful deletion
                loadAdminGallery();
            } else {
                alert("Failed to delete file: " + (result.message || "Unknown error occurred."));
            }
        } catch (err) {
            console.error("Error during fetch:", err);
            alert("Connection error: Unable to communicate with the server.");
        }
    }
}

function generatePDF(groupType, timestamp, cause, solution, imageUrl) {
    // Bina struktur HTML secara dinamik untuk PDF
    const content = `
        <div class="pdf-content">
            <h1>RoadVision AI - Inspection Report</h1>
            <p><strong>Defect Type:</strong> ${groupType}</p>
            <p><strong>Timestamp:</strong> ${timestamp}</p>
            <hr>
            <img src="${imageUrl}" style="width: 100%; max-width: 400px; border-radius: 10px;">
            <h3>Analysis</h3>
            <p><strong>Cause:</strong> ${cause}</p>
            <p><strong>Solution:</strong> ${solution}</p>
            <hr>
            <p style="font-size: 10px; color: gray;">Generated by RoadVision AI System</p>
        </div>
    `;

    const opt = {
        margin:       0.5,
        filename:     `Report_${groupType}_${timestamp}.pdf`,
        image:        { type: 'jpeg', quality: 1 }, // Quality maksima
        html2canvas:  { scale: 3, useCORS: true }, // Skala lebih tinggi untuk kualiti gambar
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(content).save();
}

function updateAdminDashboard(detections) {
    const tableBody = document.getElementById('repairTableBo');

    if (!tableBody) {
        console.error("ID 'repairTableBo' tidak dijumpai dalam HTML!");
        return;
    }

    tableBody.innerHTML = '';

    detections.forEach((group, index) => {
        // PERBAIKAN 1: Ambil imagesArray daripada group
        const imagesArray = group.images || []; 
        
        // Kira maxConf
        const maxConf = imagesArray.length > 0 
            ? Math.max(...imagesArray.map(i => i.confidence)) 
            : (group.confidence || 0);

        let priority = maxConf >= 90 ? 'Critical' : (maxConf >= 50 ? 'Medium' : 'Low');
        
        // PERBAIKAN 2: Warna badge yang lebih dinamik
        let badgeClass = "bg-orange-100 text-orange-600"; // Default Medium
        if (priority === 'Critical') badgeClass = "bg-red-100 text-red-600";
        if (priority === 'Low') badgeClass = "bg-slate-100 text-slate-600";

        const row = document.createElement('tr');
        row.className = "border-b border-slate-100";
        row.innerHTML = `
            <td class="py-3 font-semibold text-slate-700">${group.type}</td>
            <td class="py-3">
                <span class="px-2 py-1 rounded-md text-[10px] font-bold ${badgeClass}">
                    ${priority}
                </span>
            </td>
            <td class="py-3">
                <button onclick="verifyRepair(this)" class="text-blue-600 hover:underline font-bold text-xs">Verify</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}


// FUNGSI UNTUK VERIFY (HILANGKAN ROW)
function verifyRepair(button) {
    const row = button.closest('tr');
    const rowId = row.id; // Contoh ID: "row-12345"

    // 1. Kemaskini Storan Tempatan (Persistent Data)
    const savedLogs = JSON.parse(localStorage.getItem('repairLogs')) || {};
    delete savedLogs[rowId.replace('admin-', '')]; // Padam kunci data
    localStorage.setItem('repairLogs', JSON.stringify(savedLogs));

    // 2. Animasi & Pembersihan
    row.style.transition = "all 0.5s ease";
    row.style.opacity = "0";

    setTimeout(() => {
        row.remove();
        console.log("Status tugasan telah dikemaskini dalam sistem.");
    }, 500);
}


function initAnalyticsChart() {
    const chartCanvas = document.getElementById('analyticsChart');

    // 🛡️ LAPISAN PELINDUNG: Jika elemen kanvas tiada di halaman ini, keluar dengan selamat!
    if (!chartCanvas) {
        console.warn("⚠️ [Chart Info] Kanvas 'analyticsChart' tiada di paparan ini. Inisialisasi graf ditangguhkan.");
        return;
    }

    // Jika kanvas wujud, barulah kita ambil context 2d dan bina graf
    const ctx = chartCanvas.getContext('2d');

    myChart = new Chart(ctx, {
        type: 'line', // Graf garisan (Line Chart)
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Longitudinal',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4, // Membuatkan garisan nampak 'smooth'
                    fill: true
                },
                {
                    label: 'Transverse',
                    data: [],
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { position: 'top' } }
        }
    });
}


function updateChartData(longitudinalCount, transverseCount) {
    if (myChart) {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Simpan 7 data terkini sahaja supaya graf nampak kemas
        if (chartHistory.labels.length >= 7) {
            chartHistory.labels.shift();
            chartHistory.long.shift();
            chartHistory.trans.shift();
        }

        chartHistory.labels.push(now);
        chartHistory.long.push(longitudinalCount);
        chartHistory.trans.push(transverseCount);

        myChart.data.labels = chartHistory.labels;
        myChart.data.datasets[0].data = chartHistory.long;
        myChart.data.datasets[1].data = chartHistory.trans;
        myChart.update();
    }
}

function enterDashboard() {
    document.getElementById('landingView').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden');
    if (!map) { initMap(); }
    if (!myChart) { initAnalyticsChart(); }
}

function backToIntroduction() {
    stopCameraStream();
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('landingView').classList.remove('hidden');
}

function switchView(view) {
    // 1. Dapatkan elemen butang
    const btnUser = document.getElementById('btnUser');
    const btnAdmin = document.getElementById('btnAdmin');

    // 2. Dapatkan elemen paparan
    const mainContent = document.querySelector('#dashboardView > main');
    const adminView = document.getElementById('adminView');

    if (view === 'admin') {
        // --- LOGIK ADMIN ---
        // Tunjukkan modal login untuk pengesahan (seperti sedia ada)
        document.getElementById('adminLoginModal').classList.remove('hidden');

        // Tukar gaya butang (Admin jadi 'timbul', User jadi 'biasa')
        btnAdmin.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
        btnAdmin.classList.remove('text-slate-500');

        btnUser.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
        btnUser.classList.add('text-slate-500');
    } else {
        // --- LOGIK USER ---
        // Sembunyikan adminView, tunjukkan mainContent (seperti sedia ada)
        if (adminView) adminView.classList.add('hidden');
        mainContent.classList.remove('hidden');

        // Tukar gaya butang (User jadi 'timbul', Admin jadi 'biasa')
        btnUser.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
        btnUser.classList.remove('text-slate-500');

        btnAdmin.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
        btnAdmin.classList.add('text-slate-500');
    }
}

function verifyAdmin() {
    const pass = document.getElementById('adminPass').value;
    if (pass === "admin123") { // Password anda
        closeLoginModal();
        const mainContent = document.querySelector('#dashboardView > main');
        const adminView = document.getElementById('adminView');
        mainContent.classList.add('hidden');
        adminView.classList.remove('hidden');
        document.getElementById('adminPass').value = ''; // Reset input
        loadAdminGallery();
    } else {
        alert("Invalid credentials. Access denied.");
    }
}

function closeLoginModal() {
    document.getElementById('adminLoginModal').classList.add('hidden');
}


function initMap() {
    map = L.map('map').setView([2.3138, 102.3183], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);

    heatLayer = L.heatLayer([], {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: {0.4: 'blue', 0.65: 'lime', 1: 'red'}
    }).addTo(map);
}

// Simpan rujukan marker supaya kita boleh update
let currentMarker = null;

function addMarkerToMap(type, severity, location) {
    // 1. Semakan Keselamatan (Tambahan: Pastikan lat/lng wujud)
    if (!map || !location || typeof location.lat === 'undefined' || typeof location.lng === 'undefined') {
        console.warn("⚠️ Marker tidak dapat ditambah: Lokasi tidak sah.");
        return;
    }

    const lat = location.lat;
    const lng = location.lng;

    // 2. Gunakan array untuk menyimpan marker (Supaya banyak marker boleh wujud)
    // Jangan guna pembolehubah tunggal 'currentMarker' jika mahu simpan sejarah kerosakan
    if (!window.allMarkers) window.allMarkers = [];

    const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: severity === 'Critical' ? 'red' : 'orange',
        fillOpacity: 0.8
    }).addTo(map)
      .bindPopup(`<b>${type}</b><br>Priority: ${severity}`);

    window.allMarkers.push(marker);

    // 3. Tambah ke heatmap
    if (typeof heatPoints !== 'undefined' && typeof heatLayer !== 'undefined') {
        heatPoints.push([lat, lng, 0.5]);
        heatLayer.setLatLngs(heatPoints);
    }

    // 4. Pan peta (Opsyenal: Hanya pan jika perlu)
    map.panTo([lat, lng]);
}


function openModal(url, type) {
    document.getElementById('modalImg').src = url;
    document.getElementById('modalCaption').innerText = `Instance: ${type}`;
    document.getElementById('imageModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeModal() {
    document.getElementById('imageModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function startLiveCctv() {
    stopCameraStream();
    imgPlaceholder.style.display = "none";
    uploadedVideo.classList.add('hidden');
    document.getElementById('cameraContainer').classList.add('hidden');
    document.getElementById('captureBtn').classList.add('hidden');
    document.getElementById('startCamBtn').classList.remove('hidden');

    // Kekalkan rute stream video yang betul
    processedImg.src = `${BACKEND_URL}/video_feed?source=0`;
    processedImg.classList.remove('hidden');
    processedImg.classList.remove('opacity-0');
    processedImg.classList.add('opacity-100');

    document.getElementById("systemStatus").innerText = "CCTV Live Streaming";

    // ⚡ PEMBAIKAN: BUANG TERUS EMIT PEMBERSIHAN DI SINI!
    // Kita tak usik langsung resultsDiv di sini supaya tidak berlaku pertindihan timing.
}

function stopCameraStream() { if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; } }

async function initCamera() {
  try {
    imgPlaceholder.style.display = "none"; processedImg.classList.add('hidden'); uploadedVideo.classList.add('hidden');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    videoFeed.srcObject = stream;
    document.getElementById('cameraContainer').classList.remove('hidden');
    document.getElementById('startCamBtn').classList.remove('hidden');
    document.getElementById('captureBtn').classList.remove('hidden');
    document.getElementById("systemStatus").innerText = "Ready to Scan";
  } catch (err) { alert("Camera access denied."); }
}

/**
 * Fungsi untuk menangkap frame dari <video>, menghantar ke backend,
 * dan memaparkan hasil deteksi AI.
 */


async function captureImage() {
    const video = document.getElementById('videoFeed');
    const imgElement = document.getElementById('processedImg');

    if (!video || video.videoWidth === 0) {
        alert("Kamera belum bersedia.");
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
        if (!blob) return;

        const formData = new FormData();
        formData.append("image", blob, "snapshot.jpg");

        // --- TAMBAHAN: MENDAPATKAN GPS ---
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                });
            });
            formData.append("lat", pos.coords.latitude);
            formData.append("lng", pos.coords.longitude);
            console.log("📍 Lokasi diperolehi:", pos.coords.latitude, pos.coords.longitude);
        } catch (err) {
            console.warn("⚠️ Gagal dapatkan lokasi:", err.message);
            formData.append("lat", 0); // Nilai fallback
            formData.append("lng", 0);
        }
        // ---------------------------------

        try {
            const response = await fetch(`${BACKEND_URL}/detect_snapshot`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.detections && data.detections.length > 0) {
                // ... (Kod UI anda sedia ada)
                updateUI(data);
            } else {
                alert("Tiada retakan dijumpai.");
            }
        } catch (error) {
            console.error("Ralat Rangkaian:", error);
        }
    }, 'image/jpeg', 0.9);
}

async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    // 1. Reset UI (seperti asal)
    stopCameraStream();
    imgPlaceholder.style.display = "none";
    document.getElementById('cameraContainer').classList.add('hidden');
    document.getElementById('captureBtn').classList.add('hidden');
    document.getElementById('startCamBtn').classList.remove('hidden');

    // 2. Dapatkan Lokasi GPS (PENTING)
    // Kita gunakan 'let' untuk menyimpan nilai yang akan dihantar
    let lat = 0;
    let lng = 0;

    try {
        console.log("📍 [File Upload] Mencari lokasi GPS...");
        const pos = await new Promise((resolve, reject) => {
            // timeout 5 saat untuk elakkan UI tergantung lama
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000
            });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        console.log("✅ [File Upload] Lokasi diperolehi:", lat, lng);
    } catch (err) {
        console.warn("⚠️ [File Upload] GPS Gagal (Mungkin disekat):", err.message);
    }

    // 3. Persediaan UI Media
    if (file.type.startsWith('video/')) {
        uploadedVideo.src = URL.createObjectURL(file);
        uploadedVideo.classList.remove('hidden');
        processedImg.classList.add('hidden');

        // Panggil fungsi hantar dengan parameter lokasi
        sendToServer(file, "/detect_video", lat, lng);
    } else {
        uploadedVideo.classList.add('hidden');
        processedImg.classList.remove('hidden');
        processedImg.classList.add('opacity-0');

        // Panggil fungsi hantar dengan parameter lokasi
        sendToServer(file, "/detect", lat, lng);
    }
}

// Tambahkan lat dan lng sebagai parameter
async function sendToServer(file, endpoint, lat, lng) {
  const formData = new FormData();
  const fieldName = (endpoint === "/detect_video") ? "video" : "image";

  formData.append(fieldName, file);
  // Tambah baris ini supaya backend boleh terima koordinat
  formData.append("lat", lat);
  formData.append("lng", lng);

  document.getElementById("systemStatus").innerText = "Analyzing...";
  resultsDiv.innerHTML = `<div class="bg-white rounded-2xl p-10 flex flex-col items-center"><div class="loader"></div></div>`;

  try {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, { method: "POST", body: formData });
    const data = await response.json();
    updateUI(data);
  } catch (err) {
    resultsDiv.innerHTML = `<p class="text-red-500 text-center font-bold">Backend connection failed!</p>`;
    document.getElementById("systemStatus").innerText = "Error";
  }
}


function updateUI(data, isLiveCCTV = false) {
    try {
        console.log("📥 updateUI menerima data:", data, "Mod CCTV:", isLiveCCTV);

        // --- TAMBAHAN: Sambungan ke Carta Lokasi (Integrasi Data) ---
        if (data && data.detections && data.detections.length > 0) {
            data.detections.forEach(group => {
                const location = group.location || data.location;
                if (location && location.address) {
                    const detectionEntry = {
                        ...group,
                        location: location,
                        timestamp: group.timestamp || new Date().toLocaleString()
                    };
                    window.allDetections.push(detectionEntry);
                }
            });
            
            if (typeof updateLocationChart === 'function') {
                updateLocationChart(window.allDetections);
            }
        }
        // -----------------------------------------------------------

        const resultsDiv = document.getElementById("results");
        if (!resultsDiv) {
            console.error("❌ Elemen id='results' tidak dijumpai.");
            return;
        }

        // 1. Bahagian Media
        if (data.processed_video) {
            uploadedVideo.src = data.processed_video;
            uploadedVideo.classList.remove('hidden');
            uploadedVideo.load();
            uploadedVideo.play();
        } else if (data.processed_image) {
            processedImg.src = data.processed_image;
            processedImg.classList.remove('hidden');
            processedImg.classList.remove('opacity-0');
            processedImg.classList.add('opacity-100');

            processedImg.onload = () => {
                if (data.detections && data.detections.length > 0) {
                    drawBoxesOnImage(data.detections, processedImg);
                }
            };
        } else if (data.detections && data.detections.length > 0) {
            const video = document.getElementById('videoFeed');
            if (video) {
                drawBoxesOnImage(data.detections, video);
            }
        }

        // 2. Pembersihan Placeholder
        if (data.detections && data.detections.length > 0) {
            if (!isLiveCCTV) {
                resultsDiv.innerHTML = "";
            } else {
                if (resultsDiv.innerHTML.includes("No road damage") ||
                    resultsDiv.innerHTML.includes("CCTV Monitoring Active") ||
                    resultsDiv.innerHTML.includes("Clear road") ||
                    resultsDiv.querySelector('.empty-warning-state')) {
                    resultsDiv.innerHTML = "";
                }
            }
        }

        const adminTableBody = document.getElementById("repairTableBody");
        const adminPendingTable = document.getElementById("repairTableBo");
        const savedLogs = JSON.parse(localStorage.getItem('repairLogs')) || {};

        let totalDetections = 0;
        let longitudinalCount = 0;
        let transverseCount = 0;
        let criticalCount = 0;
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (!data.detections || data.detections.length === 0) {
            const globalLoc = data.location;
            const locText = (globalLoc && globalLoc.address) ? globalLoc.address : "Location not available";

            if (resultsDiv.children.length === 0) {
                resultsDiv.innerHTML = `<div class="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300 italic text-slate-400">
                    Clear road - no defects found.<br><span class="text-[10px]">📍 ${locText}</span>
                </div>`;
            }
            if (typeof updateChartData === 'function') updateChartData(0, 0);
        } else {
            data.detections.forEach((group, index) => {
                const imagesArray = group.images || [];
                const countInGroup = imagesArray.length > 0 ? imagesArray.length : 1;

                if (isLiveCCTV) {
                    window.liveDetectionsCount = (window.liveDetectionsCount || 0) + countInGroup;
                } else {
                    // Tukar kepada ini supaya ia sentiasa menambah:
                    window.liveDetectionsCount = (window.liveDetectionsCount || 0) + countInGroup;
                }
                totalDetections = window.liveDetectionsCount;

                const maxConf = imagesArray.length > 0 ? Math.max(...imagesArray.map(i => i.confidence)) : (group.confidence || 0);

                if (group.type.toLowerCase().includes("longitudinal")) longitudinalCount += countInGroup;
                else if (group.type.toLowerCase().includes("transverse")) transverseCount += countInGroup;

                let severity = "Low";
                let badgeColor = "bg-green-600";
                if (maxConf >= 90) {
                    severity = "Critical";
                    badgeColor = "bg-red-600";
                    if (isLiveCCTV) window.liveCriticalCount = (window.liveCriticalCount || 0) + countInGroup;
                } else if (maxConf >= 50) {
                    severity = "Medium";
                    badgeColor = "bg-orange-500";
                }
                if (!isLiveCCTV && severity === "Critical") criticalCount++;

                const rowId = 'row-' + group.type.replace(/\s+/g, '-') + '-' + (index + Date.now());
                const currentStatus = savedLogs[rowId] || 'Detected';

                if (adminTableBody) {
                    const row = document.createElement("tr");
                    row.id = rowId;
                    row.className = "border-t border-slate-100 hover:bg-slate-50";
                    row.innerHTML = `<td class="px-6 py-4 font-semibold text-slate-800">${group.type}</td>
                                     <td class="px-6 py-4"><span class="px-2 py-1 rounded-md text-[10px] font-bold ${severity === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}">${severity}</span></td>
                                     <td class="px-6 py-4 text-center font-bold text-[10px] text-slate-600 status-display">${currentStatus}</td>
                                     <td class="px-6 py-4 text-right"><button onclick="verifyRepair(this)" class="text-blue-600 hover:underline font-bold text-xs">Verify</button></td>`;
                    if (isLiveCCTV) adminTableBody.prepend(row); else adminTableBody.appendChild(row);
                }

                if (adminPendingTable) {
                    const pendingRow = document.createElement("tr");
                    pendingRow.id = "admin-" + rowId;
                    pendingRow.className = "border-b border-slate-100";
                    pendingRow.innerHTML = `
                        <td class="py-3 font-semibold text-slate-700">${group.type}</td>
                        <td class="py-3">
                            <select onchange="syncStatus('${rowId}', this.value)" class="bg-indigo-50 p-1 rounded font-bold text-[10px] text-indigo-700 outline-none">
                                <option value="Detected" ${currentStatus === 'Detected' ? 'selected' : ''}>Detected</option>
                                <option value="In Progress" ${currentStatus === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                <option value="Fixed" ${currentStatus === 'Fixed' ? 'selected' : ''}>Fixed</option>
                            </select>
                        </td>
                        <td class="py-3"><button onclick="verifyRepair(this)" class="text-emerald-600 font-bold text-xs">Verify</button></td>
                    `;
                    if (isLiveCCTV) adminPendingTable.prepend(pendingRow); else adminPendingTable.appendChild(pendingRow);
                }

                if (typeof addMarkerToMap === 'function') {
                    try {
                        if (group.location && group.location.lat != null && group.location.lng != null) {
                            addMarkerToMap(group.type, severity, group.location);
                        }
                    } catch(m_err) {
                        console.error("❌ Ralat marker:", m_err);
                    }
                }

                const advice = group.expert_info || { punca: "Analyzing cause...", solusi: "Providing engineering solution..." };
                const loc = group.location || {};
                const locDisplay = (loc && loc.address && loc.address !== "Lokasi tidak ditemui")
                    ? loc.address
                    : (loc.lat ? `Lat: ${loc.lat.toFixed(4)}, Lng: ${loc.lng.toFixed(4)}` : "📍 No location detected");

                const hasLocation = loc.lat !== null && loc.lat !== undefined && loc.lat !== 0;
                let mapLinkHtml = "";

                if (hasLocation) {
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
                    mapLinkHtml = `
                    <a href="${mapsUrl}" target="_blank"
                       class="mt-4 bg-blue-50/80 p-3 rounded-xl border border-blue-100 flex items-start gap-2 hover:bg-blue-100 transition-colors cursor-pointer group block">
                        <div class="flex items-start gap-2">
                            <div class="mt-0.5 text-blue-600 flex-shrink-0">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <p class="text-[9px] uppercase font-black text-blue-400 tracking-wider mb-0.5 group-hover:text-blue-500">View on Map</p>
                                <p class="text-[11px] font-semibold text-slate-700 leading-snug whitespace-normal break-words">${locDisplay}</p>
                            </div>
                        </div>
                    </a>`;
                } else {
                    mapLinkHtml = `
                    <div class="mt-4 bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-2 cursor-default">
                        <p class="text-[11px] font-semibold text-slate-400 italic">📍 No location data available</p>
                    </div>`;
                }

                const card = document.createElement("div");
                card.className = "bg-white rounded-2xl p-5 shadow-sm border border-slate-200 mb-6 fade-in text-left";

                let imagesHtml = (imagesArray.length > 0) ? imagesArray.map(img => `
                    <div class="relative flex-shrink-0 cursor-pointer hover:scale-105 transition-transform" onclick="openModal('${img.crop_url}', '${group.type}')">
                        <img src="${img.crop_url}" class="w-24 h-24 rounded-xl object-cover border border-slate-100 shadow-sm" onerror="this.src='https://placehold.co/100x100?text=CCTV+Crop'">
                        <div class="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded font-bold">${img.confidence}%</div>
                    </div>`).join('') : `
                    <div class="relative flex-shrink-0 cursor-pointer hover:scale-105 transition-transform" onclick="openModal('${group.crop_url || 'https://placehold.co/100x100?text=No+Image'}', '${group.type}')">
                        <img src="${group.crop_url || 'https://placehold.co/100x100?text=No+Image'}" class="w-24 h-24 rounded-xl object-cover border border-slate-100 shadow-sm" onerror="this.src='https://placehold.co/100x100?text=No+Image'">
                        <div class="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded font-bold">${maxConf}%</div>
                    </div>`;

                card.innerHTML = `
                    <div class="mb-4">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <h3 class="font-extrabold text-slate-800 text-lg capitalize">${group.type}</h3>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Detected at ${group.timestamp || timestamp}</p>
                            </div>
                            <span class="text-[9px] ${badgeColor} text-white font-black px-2 py-1 rounded-md uppercase">${severity} Priority</span>
                        </div>
                        <div class="flex gap-3 overflow-x-auto pb-3 custom-scrollbar">${imagesHtml}</div>
                    </div>
                    <div class="space-y-2">
                        <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase"><span>Detection Confidence</span><span>${maxConf}%</span></div>
                        <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden"><div class="bg-blue-600 h-1.5 rounded-full" style="width: ${maxConf}%"></div></div>
                    </div>
                    <div class="p-3 mt-4 bg-slate-50 rounded-xl space-y-3 text-left">
                        <div><p class="text-[9px] font-black text-slate-400 uppercase">Analysis (Cause)</p><p class="text-[11px] text-slate-700">${advice.punca || 'N/A'}</p></div>
                        <div class="pt-3 border-t border-slate-200"><p class="text-[9px] font-black text-slate-400 uppercase">Engineering Solution</p><p class="text-[11px] text-slate-700">${advice.solusi || 'N/A'}</p></div>
                    </div>
                    ${mapLinkHtml}`;

                if (isLiveCCTV) resultsDiv.prepend(card); else resultsDiv.appendChild(card);
            });

            if (typeof updateChartData === 'function') updateChartData(longitudinalCount, transverseCount);
            if (isLiveCCTV) resultsDiv.scrollTop = 0; else resultsDiv.scrollTop = resultsDiv.scrollHeight;
        }

        // --- UPDATE STATISTIK ---
        if (document.getElementById("statTotal")) document.getElementById("statTotal").innerText = totalDetections;
        if (document.getElementById("statHigh")) document.getElementById("statHigh").innerText = isLiveCCTV ? (window.liveCriticalCount || 0) : criticalCount;
        if (document.getElementById("foundCount")) document.getElementById("foundCount").innerText = `${totalDetections} Detections`;
        if (document.getElementById("systemStatus")) document.getElementById("systemStatus").innerText = isLiveCCTV ? "CCTV Live Monitoring" : "Analysis Complete";

        // --- TAMBAHAN: UPDATE KAD PENDING REPAIRS BERDASARKAN JADUAL ---
       const totalCard = document.getElementById("totalDetections");
        if (totalCard) totalCard.innerText = totalDetections;

        // 3. Update Kad: Pending Repairs (Menggunakan logik tbody untuk ketepatan)
        const pendingTable = document.getElementById("repairTableBo");
        if (pendingTable) {
            const tbody = pendingTable.getElementsByTagName("tbody")[0];
            const rowCount = tbody ? tbody.rows.length : pendingTable.rows.length;
            
            const pendingCard = document.getElementById("pendingCount");
            if (pendingCard) pendingCard.innerText = rowCount;
        }

    } catch (e) {
        console.error("❌ CRASH DI DALAM FUNGSI updateUI:", e);
    }
}


// Pastikan nama event 'new_detection' sebijik sama dengan socketio.emit di backend
socket.on('new_detection', function(data) {
    console.log("🔔 [SOCKET RECEIVED] Data live CCTV dikesan masuk ke Frontend!", data);

    if (data && data.detections && data.detections.length > 0) {
        // Hantar parameter kedua sebagai 'true' untuk mod Live CCTV
        updateUI(data, true);
    } else {
        console.warn("⚠️ Data socket diterima tetapi format 'detections' kosong atau tidak sah.");
    }
});


function drawBoxesOnImage(detections, element) {
    if (!element) return;

    // 1. Pastikan parent mempunyai position relative
    if (element.parentElement && window.getComputedStyle(element.parentElement).position === 'static') {
        element.parentElement.style.position = 'relative';
    }

    // 2. Ambil saiz asal imej/video yang lebih tepat
    const naturalWidth = element.naturalWidth || element.videoWidth || 640;
    const naturalHeight = element.naturalHeight || element.videoHeight || 640;

    const displayWidth = element.offsetWidth || element.clientWidth;
    const displayHeight = element.offsetHeight || element.clientHeight;

    // Kira skala nisbah koordinat (kunci kepada ketepatan kotak)
    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;

    // 3. Bina atau dapatkan Container Utama
    let container = document.getElementById('boxContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'boxContainer';
        container.style.position = 'absolute';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '50';
        element.parentElement.appendChild(container);
    }

    // Selaraskan kedudukan container
    container.style.top = element.offsetTop + 'px';
    container.style.left = element.offsetLeft + 'px';
    container.style.width = displayWidth + 'px';
    container.style.height = displayHeight + 'px';
    container.innerHTML = '';

    // Tambah SVG untuk lukisan mask (Segmentation)
    const svgNS = "http://www.w3.org/2000/svg";
    const svgCanvas = document.createElementNS(svgNS, "svg");
    svgCanvas.style.position = "absolute";
    svgCanvas.style.top = "0";
    svgCanvas.style.left = "0";
    svgCanvas.style.width = "100%";
    svgCanvas.style.height = "100%";
    container.appendChild(svgCanvas);

    if (!detections || !Array.isArray(detections)) return;

    // Loop melalui detections
    detections.forEach(deteksi => {
        const imagesArray = deteksi.images || [];

        imagesArray.forEach(item => {
            // LALUAN A: LUKIS MASK (Jika ada data segment)
            if (item.segment && item.segment.length > 0) {
                const pointsString = item.segment
                    .map(coord => `${coord[0] * scaleX},${coord[1] * scaleY}`)
                    .join(" ");
                const polygon = document.createElementNS(svgNS, "polygon");
                polygon.setAttribute("points", pointsString);
                polygon.setAttribute("fill", "rgba(59, 130, 246, 0.4)");
                polygon.setAttribute("stroke", "#3b82f6");
                polygon.setAttribute("stroke-width", "2");
                svgCanvas.appendChild(polygon);
            }

            // LALUAN B: LUKIS BOX (Fokus pada item.box yang dihasilkan oleh Backend)
            if (item.box) {
                const b = item.box;
                const boxDiv = document.createElement('div');

                boxDiv.style.position = 'absolute';
                boxDiv.style.border = '2px solid #3b82f6';
                boxDiv.style.borderRadius = '4px';
                // Guna Math.max/min untuk elak box terkeluar
                boxDiv.style.left = (b.x1 * scaleX) + 'px';
                boxDiv.style.top = (b.y1 * scaleY) + 'px';
                boxDiv.style.width = ((b.x2 - b.x1) * scaleX) + 'px';
                boxDiv.style.height = ((b.y2 - b.y1) * scaleY) + 'px';

                // Label
                const labelSpan = document.createElement('span');
                labelSpan.innerText = `${deteksi.type} ${item.confidence}%`;
                labelSpan.style.position = 'absolute';
                labelSpan.style.top = '-20px';
                labelSpan.style.left = '0px';
                labelSpan.style.backgroundColor = '#3b82f6';
                labelSpan.style.color = 'white';
                labelSpan.style.fontSize = '10px';
                labelSpan.style.padding = '2px 5px';
                labelSpan.style.borderRadius = '3px';

                boxDiv.appendChild(labelSpan);
                container.appendChild(boxDiv);
            }
        });
    });
}


function addRepairEntry(type, severity) {
    const tableBody = document.getElementById('repairTableBody');
    const newId = 'row-' + Date.now();

    // Tambah 4 <td> untuk selari dengan 4 <th> dalam HTML User Page
    tableBody.innerHTML += `
        <tr id="${newId}">
            <td class="px-6 py-3">${type}</td>
            <td class="px-6 py-3">${severity}</td>
            <td class="px-6 py-3">
                <select onchange="syncStatus('${newId}', this.value)">
                    <option value="Detected" selected>Detected</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Fixed">Fixed</option>
                </select>
            </td>
            <td class="px-6 py-3 text-right">
                <button class="text-indigo-600">Action</button>
            </td>
        </tr>
    `;
}

function syncStatus(id, status) {
    console.log("Menukar status untuk ID:", id, "kepada:", status);

    // 1. SIMPAN STATUS KE LOCALSTORAGE
    const savedLogs = JSON.parse(localStorage.getItem('repairLogs')) || {};
    savedLogs[id] = status;
    localStorage.setItem('repairLogs', JSON.stringify(savedLogs));

    // 2. UPDATE DI USER LOG (Detailed Repair Log)
    const userRow = document.getElementById(id);
    if (userRow) {
        const displayCell = userRow.querySelector('.status-display');
        if (displayCell) {
            displayCell.innerText = status;
            displayCell.style.color = (status === 'In Progress') ? '#f97316' :
                                      (status === 'Fixed') ? '#10b981' : '#475569';
        }
    }

    // 3. LOGIK JIKA STATUS ADALAH 'FIXED'
    if (status === 'Fixed') {
        setTimeout(() => {
            // Buang dari User Log
            if (userRow) {
                userRow.style.transition = "opacity 0.5s ease";
                userRow.style.opacity = "0";
                setTimeout(() => userRow.remove(), 500);
            }

            // Buang dari Pending Repairs List (Admin)
            const adminRow = document.getElementById('admin-' + id);
            if (adminRow) {
                adminRow.style.transition = "opacity 0.5s ease";
                adminRow.style.opacity = "0";
                setTimeout(() => adminRow.remove(), 500);
            }

            // PADAM DARI LOCALSTORAGE
            delete savedLogs[id];
            localStorage.setItem('repairLogs', JSON.stringify(savedLogs));

            console.log("Tugasan telah diselesaikan dan dibuang dari sistem.");
        }, 500);
    }
}

async function sendSnapshot(imageBlob) {
    const formData = new FormData();
    formData.append("image", imageBlob);

    // 1. Dapatkan lokasi DULU
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000
            });
        });

        // PENTING: Pastikan anda append lat dan lng di sini
        formData.append("lat", pos.coords.latitude);
        formData.append("lng", pos.coords.longitude);
        console.log("📍 Koordinat berjaya di-append:", pos.coords.latitude, pos.coords.longitude);

    } catch (err) {
        console.warn("⚠️ Gagal dapatkan lokasi:", err.message);
        // Jika gagal, jangan hantar null, atau hantar sebagai string "null"
        formData.append("lat", "null");
        formData.append("lng", "null");
    }

    // 2. Hantar formData
    const response = await fetch('/detect_snapshot', {
        method: 'POST',
        body: formData // Payload akan mengandungi lat & lng di sini
    });
    // ...
}

async function startCamera() {
    // 1. Tentukan tetapan kamera
    const constraints = {
        video: {
            // "environment" adalah standard untuk kamera belakang
            facingMode: { exact: "environment" }
        }
    };

    try {
        // 2. Minta akses kamera
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // 3. Masukkan stream ke dalam elemen video
        const videoFeed = document.getElementById('videoFeed');
        videoFeed.srcObject = stream;
        videoFeed.play();

    } catch (err) {
        // Jika kamera belakang tidak dijumpai, cuba buka mana-mana kamera yang ada
        console.warn("Kamera belakang tidak dijumpai, mencuba kamera lain...", err);

        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
            document.getElementById('videoFeed').srcObject = fallbackStream;
        } catch (fallbackErr) {
            alert("Kamera tidak boleh dibuka. Sila pastikan kebenaran kamera telah diberikan.");
            console.error("Ralat penuh:", fallbackErr);
        }
    }
}

function verifyRepair(button) {
    const row = button.closest('tr');
    const rowId = row.id.replace('admin-', '');

    // 1. Buang dari localStorage
    const savedLogs = JSON.parse(localStorage.getItem('repairLogs')) || {};
    delete savedLogs[rowId];
    localStorage.setItem('repairLogs', JSON.stringify(savedLogs));

    // 2. Animasi & Buang dari DOM
    row.style.transition = "all 0.5s ease";
    row.style.opacity = "0";
    
    setTimeout(() => {
        row.remove();
        // Kalau ada row pasangan (User log), buang juga
        const otherRow = document.getElementById(rowId);
        if (otherRow) otherRow.remove();

        // --- TAMBAHAN: UPDATE KAUNTER DI SINI ---
        updatePendingCounters(); 
    }, 500);
}

// Fungsi pembantu untuk update semua kad kaunter
function updatePendingCounters() {
    const pendingTable = document.getElementById("repairTableBo");
    if (pendingTable) {
        const tbody = pendingTable.getElementsByTagName("tbody")[0];
        const rowCount = tbody ? tbody.rows.length : pendingTable.rows.length;
        
        const pendingCard = document.getElementById("pendingCount");
        if (pendingCard) {
            pendingCard.innerText = rowCount;
        }
    }
}

function generatePDF() {
    // Pastikan dashboardView tidak 'hidden' semasa jana PDF
    const element = document.getElementById('dashboardView');
    
    // Periksa jika elemen wujud
    if (!element) {
        alert("Ralat: Dashboard tidak dijumpai.");
        return;
    }

    const opt = {
        margin:       [0.5, 0.5],
        filename:     'Laporan_RoadVision_AI.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true }, 
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    // Proses jana PDF
    alert("Laporan sedang dijana, sila tunggu sebentar...");
    html2pdf().set(opt).from(element).save();
}



/**
 * Updates the top detection locations bar chart and checks for hotspots
 * @param {Array} detections - Array of detection objects
 */
function updateLocationChart(detections) {
    const canvas = document.getElementById('topLocationsChart');
    if (!canvas) {
        console.warn("⚠️ Canvas 'topLocationsChart' not found!");
        return;
    }

    // 1. Data Aggregation: Group by location
    const locationCounts = {};
    const fullAddressMap = {}; 

    detections.forEach(d => {
        let rawAddr = (d.location && d.location.address) ? d.location.address.trim() : "Unknown Location";
        let parts = rawAddr.split(',');
        let shortAddr = parts.slice(0, 2).join(', ').trim();
        
        locationCounts[shortAddr] = (locationCounts[shortAddr] || 0) + 1;
        fullAddressMap[shortAddr] = rawAddr; 
    });

    const displayLabels = Object.keys(locationCounts);
    const dataValues = Object.values(locationCounts);

    // 2. Destroy the previous chart instance to prevent flickering
    if (window.topLocationsChartInstance) {
        window.topLocationsChartInstance.destroy();
    }

    // 3. Create the new chart
    const ctx = canvas.getContext('2d');
    window.topLocationsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: displayLabels,
            datasets: [{
                label: 'Damage Count',
                data: dataValues,
                backgroundColor: '#10b981', 
                borderRadius: 6,
                maxBarThickness: 30
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (context) => fullAddressMap[context[0].label] || context[0].label,
                        label: (context) => ` Total: ${context.raw}`
                    }
                }
            },
            scales: { 
                x: { 
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 },
                    grid: { color: '#f1f5f9' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });

    // 4. Integrated Hotspot Alert Logic
    const hotspot = getHotspotAlert();
    const alertDiv = document.getElementById('hotspotAlert');
    const alertText = document.getElementById('hotspotText');

    if (alertDiv && alertText) {
        if (hotspot) {
            alertText.innerText = `Area: ${hotspot.location} has recorded ${hotspot.count} damages. Immediate maintenance is recommended.`;
            alertDiv.classList.remove('hidden'); // Forces display
        } else {
            alertDiv.classList.add('hidden'); // Forces hide if no hotspot
        }
    }
}

/**
 * Opens the Admin Panel and forces an immediate data refresh
 */
async function showAdminView() { // 1. Tambah 'async' di sini
    const adminView = document.getElementById('adminView');
    
    if (adminView) {
        adminView.classList.remove('hidden');
        console.log("🚀 Admin View opened. Loading data...");

        // 2. Gunakan 'await' supaya sistem tunggu data sampai dulu
        if (typeof loadExistingData === 'function') {
            await loadExistingData(); 
            
            // 3. Selepas data siap, baru panggil fungsi chart/alert
            // Anda perlu pastikan fungsi ini dipanggil SELEPAS loadExistingData selesai
            if (typeof updateLocationChart === 'function') {
                updateLocationChart(window.allDetections);
            }
        } else {
            console.warn("⚠️ 'loadExistingData' function is not defined.");
        }
    } else {
        console.error("❌ 'adminView' element not found in HTML!");
    }
}

// GLOBAL DATA STORE
window.allDetections = [];

/**
 * Adds a new detection to the global store and updates the UI
 * @param {Object} detection - The detection object
 */
function addDetectionData(detection) {
    if (!detection || !detection.location || !detection.location.address) return;

    // 1. Masukkan ke array global
    window.allDetections.push(detection);

    // 2. Simpan ke LocalStorage (supaya data kekal walau refresh)
    localStorage.setItem('storedDetections', JSON.stringify(window.allDetections));

    // 3. Update carta
    updateLocationChart(window.allDetections);
    console.log("📥 Data ditambah dan disimpan:", detection.location.address);
}

// 4. Pastikan data dimuat semula apabila laman web dibuka
window.onload = () => {
    const saved = localStorage.getItem('storedDetections');
    if (saved) {
        window.allDetections = JSON.parse(saved);
        updateLocationChart(window.allDetections);
    }
}

async function loadAllDetections() {
    try {
        // Contoh: Mengambil data daripada API yang membaca folder outputfyp
        // Anda perlu pastikan backend Python anda mempunyai route ini
        const response = await fetch(`${BACKEND_URL}/get_all_detections_data`);
        const data = await response.json(); // Data dijangka dalam bentuk array of objects
        
        // Simpan ke dalam storan global
        window.allDetections = data;
        
        // Update carta secara automatik
        updateLocationChart(window.allDetections);
        
        console.log("✅ Data dari folder outputfyp berjaya dimuatkan:", data.length);
    } catch (error) {
        console.error("❌ Gagal memuatkan data:", error);
    }
}


async function loadExistingData() {
    try {
        const response = await fetch(`${BACKEND_URL}/get_all_outputs`);
        const data = await response.json();

        console.log("📥 Data diterima dari server:", data); 

        if (data.detections && data.detections.length > 0) {
            window.allDetections = data.detections;
            
            // 1. Update Carta Bar
            updateLocationChart(window.allDetections);
            
            // 2. Update Kad Statistik (KPI) - KAD AKAN JADI 24 BUKAN 0
            if (typeof updateKPIs === 'function') {
                updateKPIs(window.allDetections);
            }
            
            // 3. Update Jadual Pending Repairs
            if (typeof updatePendingRepairsTable === 'function') {
                updatePendingRepairsTable(window.allDetections);
            }
            
            console.log("✅ Dashboard berjaya dikemaskini dengan:", data.detections.length, "data");
        } else {
            console.warn("⚠️ Tiada data deteksi ditemui dalam respons server.");
        }
    } catch (error) {
        console.error("❌ Ralat semasa memuatkan data:", error);
    }
}


function getHotspotAlert() {
    if (window.allDetections.length === 0) return null;

    const counts = {};
    window.allDetections.forEach(d => {
        const addr = (d.location && d.location.address) ? d.location.address : "Unknown";
        counts[addr] = (counts[addr] || 0) + 1;
    });

    // Cari lokasi dengan count paling tinggi
    let maxCount = 0;
    let hotspot = "";
    for (const addr in counts) {
        if (counts[addr] > maxCount) {
            maxCount = counts[addr];
            hotspot = addr;
        }
    }

   // Tukar 5 kepada 2 untuk ujian, atau 1 jika mahu alert muncul walaupun hanya ada satu kerosakan
    return maxCount >= 2 ? { location: hotspot, count: maxCount } : null;
}

function updateKPIs(detections) {
    console.log("Updating KPIs with:", detections.length, "detections"); // Debugging
    
    // 1. Total Detections
    const totalEl = document.getElementById('totalDetections');
    if (totalEl) totalEl.innerText = detections.length;

    // 2. Pending Repairs
    const pendingEl = document.getElementById('pendingCount');
    if (pendingEl) pendingEl.innerText = detections.length; 

    // 3. Hotspot Count
    const hotspotEl = document.getElementById('hotspotCount');
    if (hotspotEl) {
        const counts = {};
        detections.forEach(d => {
            const addr = d.location?.address || "Unknown";
            counts[addr] = (counts[addr] || 0) + 1;
        });
        const hotspots = Object.values(counts).filter(count => count >= 2).length;
        hotspotEl.innerText = hotspots;
    }
}


function updatePendingRepairsTable(detections) {
    const tableBody = document.getElementById('repairTableBo');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Kosongkan jadual lama

    // Ambil 5 data terkini
    detections.slice(-5).forEach((d, index) => {
        // Bina ID unik untuk row ini supaya status boleh disimpan
        const rowId = 'row-' + (d.type || 'Damage').replace(/\s+/g, '-') + '-' + (index + Date.now());
        
        // Dapatkan status dari localStorage (supaya status tidak hilang bila refresh)
        const savedLogs = JSON.parse(localStorage.getItem('repairLogs')) || {};
        const currentStatus = savedLogs[rowId] || 'Detected';

        const row = document.createElement('tr');
        row.className = "border-b border-slate-100 hover:bg-slate-50 transition";
        row.innerHTML = `
            <td class="py-4 font-semibold text-slate-700">${d.type || 'Damage'}</td>
            <td class="py-4">
                <select onchange="syncStatus('${rowId}', this.value)" class="bg-indigo-50 p-1 rounded font-bold text-[10px] text-indigo-700 outline-none">
                    <option value="Detected" ${currentStatus === 'Detected' ? 'selected' : ''}>Detected</option>
                    <option value="In Progress" ${currentStatus === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="Fixed" ${currentStatus === 'Fixed' ? 'selected' : ''}>Fixed</option>
                </select>
            </td>
            <td class="py-4 text-blue-600 font-bold cursor-pointer hover:underline text-xs" onclick="verifyRepair(this)">Verify</td>
        `;
        tableBody.appendChild(row);
    });
}

// Tambah ini di hujung fungsi anda
function initDailyTotal() {
    const today = new Date().toDateString();
    let storedData = JSON.parse(localStorage.getItem('dailyDetectionData')) || { date: today, count: 0 };
    
    // Reset kalau hari dah berubah
    if (storedData.date !== today) {
        storedData = { date: today, count: 0 };
        localStorage.setItem('dailyDetectionData', JSON.stringify(storedData));
    }
    
    const totalDisplay = document.getElementById("totalDetections");
    if (totalDisplay) totalDisplay.innerText = storedData.count;
}

// Panggil fungsi ini semasa page load
window.onload = initDailyTotal;

function updateHotspots(allDetections) {
    // 1. Kumpulkan kerosakan mengikut lokasi
    const locations = {};
    allDetections.forEach(d => {
        const addr = d.location.address || "Unknown";
        if (!locations[addr]) locations[addr] = 0;
        locations[addr] += 1;
    });

    // 2. Kira berapa banyak lokasi yang ada kerosakan > 5 (Definisi Hotspot)
    let hotspotCount = 0;
    Object.values(locations).forEach(count => {
        if (count >= 5) hotspotCount++; // Contoh ambang (threshold) 5
    });

    // 3. Update UI
    const hotspotCard = document.getElementById("hotspotCount");
    if (hotspotCard) {
        hotspotCard.innerText = hotspotCount;
    }
}
