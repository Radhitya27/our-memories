// ========================================
// CONFIGURATION & GLOBAL VARIABLES
// ========================================

const PHOTOS_PER_PAGE = 10;
const DB_NAME = 'MemoriesDB';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const FIREBASE_PATH = 'our-memories-photos'; // Firebase path

let db;
let currentPage = 1;
let currentFilter = 'all';
let allPhotos = [];
let selectedFile = null;
let lastSyncTime = null;
let isFirebaseReady = false;

// ========================================
// FIREBASE CLOUD SYNC
// ========================================

// Check if Firebase is initialized
function checkFirebase() {
    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            isFirebaseReady = true;
            return true;
        }
    } catch (e) {
        console.log('Firebase not available');
    }
    isFirebaseReady = false;
    return false;
}

// Load photos from Firebase
async function loadFromCloud() {
    if (!checkFirebase()) {
        console.log('Firebase not ready, using local only');
        return null;
    }

    try {
        updateSyncUI('syncing');
        console.log('Loading from Firebase...');
        
        const snapshot = await firebase.database().ref(FIREBASE_PATH).once('value');
        const data = snapshot.val();
        
        if (data && Array.isArray(data)) {
            lastSyncTime = new Date();
            updateSyncUI('synced');
            console.log(`✅ Loaded ${data.length} photos from Firebase`);
            return data;
        }
        
        updateSyncUI('synced');
        console.log('No data in Firebase yet');
        return null;
    } catch (error) {
        console.error('❌ Firebase load error:', error);
        updateSyncUI('error');
        return null;
    }
}

// Save photos to Firebase
async function saveToCloud(photos) {
    if (!checkFirebase()) {
        console.log('Firebase not ready, skipping cloud save');
        return false;
    }

    try {
        updateSyncUI('syncing');
        console.log(`Saving ${photos.length} photos to Firebase...`);
        
        await firebase.database().ref(FIREBASE_PATH).set(photos);
        
        lastSyncTime = new Date();
        updateSyncUI('synced');
        console.log('✅ Saved to Firebase successfully');
        return true;
    } catch (error) {
        console.error('❌ Firebase save error:', error);
        updateSyncUI('error');
        showNotification('❌ Gagal sync ke cloud!', 'error');
        return false;
    }
}

// Update sync status UI
function updateSyncUI(status) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    
    const time = lastSyncTime ? lastSyncTime.toLocaleTimeString('id-ID') : '';
    
    if (status === 'synced') {
        el.innerHTML = `<span style="color: #4CAF50; font-weight: 600;">☁️ Tersinkron ${time ? `• ${time}` : ''}</span>`;
    } else if (status === 'syncing') {
        el.innerHTML = `<span style="color: #2196F3; font-weight: 600;">☁️ Syncing...</span>`;
    } else if (status === 'error') {
        el.innerHTML = `<span style="color: #f44336; font-weight: 600;">☁️ Offline</span>`;
    } else {
        el.innerHTML = `<span style="color: #999; font-weight: 600;">☁️ Local Only</span>`;
    }
}

// Manual sync button handler
async function manualSync() {
    if (!checkFirebase()) {
        showNotification('❌ Firebase belum siap!', 'error');
        return;
    }

    showNotification('🔄 Syncing...', 'info');
    
    try {
        // Load from Firebase
        const cloudPhotos = await loadFromCloud();
        
        if (cloudPhotos && cloudPhotos.length > 0) {
            console.log('Merging cloud data with local...');
            
            // Merge data (prevent duplicates by ID)
            const photoMap = new Map();
            
            // Add local photos
            allPhotos.forEach(photo => photoMap.set(photo.id, photo));
            
            // Add/update cloud photos
            cloudPhotos.forEach(photo => photoMap.set(photo.id, photo));
            
            // Convert back to array and sort
            const mergedPhotos = Array.from(photoMap.values()).sort((a, b) => b.timestamp - a.timestamp);
            
            // Update local
            allPhotos = mergedPhotos;
            
            // Save merged data back to IndexedDB
            await clearAllPhotos();
            for (const photo of mergedPhotos) {
                await savePhoto(photo);
            }
            
            // Save merged data back to Firebase
            await saveToCloud(mergedPhotos);
            
            renderPhotos();
            updateStorageInfo();
            showNotification(`✅ Sync berhasil! Total: ${mergedPhotos.length} kenangan`, 'success');
        } else {
            // No cloud data, upload local data to cloud
            console.log('No cloud data, uploading local to Firebase...');
            const saved = await saveToCloud(allPhotos);
            
            if (saved) {
                showNotification(`✅ ${allPhotos.length} kenangan di-upload ke cloud!`, 'success');
            } else {
                showNotification('❌ Gagal upload ke cloud!', 'error');
            }
        }
    } catch (error) {
        console.error('Sync error:', error);
        showNotification('❌ Sync gagal! Cek koneksi internet.', 'error');
    }
}

// Setup real-time listener (auto-sync when data changes)
function setupRealtimeSync() {
    if (!checkFirebase()) {
        console.log('Firebase not ready, real-time sync disabled');
        return;
    }

    console.log('Setting up real-time sync...');
    
    firebase.database().ref(FIREBASE_PATH).on('value', (snapshot) => {
        const cloudData = snapshot.val();
        
        if (cloudData && Array.isArray(cloudData)) {
            // Check if data is different
            const cloudStr = JSON.stringify(cloudData.sort((a, b) => a.id - b.id));
            const localStr = JSON.stringify(allPhotos.sort((a, b) => a.id - b.id));
            
            if (cloudStr !== localStr) {
                console.log('🔄 Data changed in cloud, auto-syncing...');
                
                // Update local data
                allPhotos = cloudData.sort((a, b) => b.timestamp - a.timestamp);
                
                // Update UI
                renderPhotos();
                updateStorageInfo();
                
                lastSyncTime = new Date();
                updateSyncUI('synced');
            }
        }
    }, (error) => {
        console.error('Real-time sync error:', error);
        updateSyncUI('error');
    });
}

// ========================================
// INDEXEDDB INITIALIZATION
// ========================================

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('Database error:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            console.log('Database opened successfully');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('category', 'category', { unique: false });
                objectStore.createIndex('type', 'type', { unique: false });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('Object store created');
            }
        };
    });
}

// ========================================
// DATABASE OPERATIONS
// ========================================

async function loadPhotos() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();
        
        request.onsuccess = () => {
            allPhotos = request.result.sort((a, b) => b.timestamp - a.timestamp);
            console.log(`Loaded ${allPhotos.length} photos from IndexedDB`);
            resolve(allPhotos);
        };
        
        request.onerror = () => {
            console.error('Error loading photos:', request.error);
            reject(request.error);
        };
    });
}

async function savePhoto(photo) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.add(photo);
        
        request.onsuccess = () => {
            console.log('Photo saved successfully');
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('Error saving photo:', request.error);
            reject(request.error);
        };
    });
}

async function deletePhotoFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.delete(id);
        
        request.onsuccess = () => {
            console.log('Photo deleted successfully');
            resolve();
        };
        
        request.onerror = () => {
            console.error('Error deleting photo:', request.error);
            reject(request.error);
        };
    });
}

async function clearAllPhotos() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.clear();
        
        request.onsuccess = () => {
            console.log('All photos cleared');
            resolve();
        };
        
        request.onerror = () => {
            console.error('Error clearing photos:', request.error);
            reject(request.error);
        };
    });
}

// ========================================
// APP INITIALIZATION
// ========================================

async function initApp() {
    try {
        showLoadingState();
        
        console.log('=================================');
        console.log('Our Memories App Starting...');
        console.log('=================================');
        
        // Check Firebase
        const firebaseAvailable = checkFirebase();
        
        // Initialize IndexedDB
        await initDB();
        
        // Load from local IndexedDB first
        await loadPhotos();
        console.log(`Loaded ${allPhotos.length} photos from local storage`);
        
        // Try to load from Firebase and merge
        if (firebaseAvailable) {
            console.log('Firebase available, loading from cloud...');
            const cloudPhotos = await loadFromCloud();
            
            if (cloudPhotos && cloudPhotos.length > 0) {
                console.log(`Found ${cloudPhotos.length} photos in cloud`);
                
                // Merge cloud and local data
                const photoMap = new Map();
                allPhotos.forEach(photo => photoMap.set(photo.id, photo));
                cloudPhotos.forEach(photo => photoMap.set(photo.id, photo));
                
                const mergedPhotos = Array.from(photoMap.values()).sort((a, b) => b.timestamp - a.timestamp);
                
                if (mergedPhotos.length > allPhotos.length) {
                    console.log(`Merged! New total: ${mergedPhotos.length} photos`);
                    allPhotos = mergedPhotos;
                    
                    // Save merged data to IndexedDB
                    await clearAllPhotos();
                    for (const photo of mergedPhotos) {
                        await savePhoto(photo);
                    }
                    
                    showNotification('☁️ Data cloud berhasil dimuat!', 'success');
                }
            } else if (allPhotos.length > 0) {
                // No cloud data but we have local, upload to cloud
                console.log('No cloud data, uploading local to Firebase...');
                await saveToCloud(allPhotos);
            }
            
            // Setup real-time sync
            setupRealtimeSync();
        } else {
            console.log('⚠️ Firebase not available, running in local-only mode');
            updateSyncUI('offline');
        }
        
        renderPhotos();
        updateStorageInfo();
        setupDragAndDrop();
        setupFileInput();
        setupKeyboardShortcuts();
        
        console.log('✅ App initialized successfully');
        console.log('Firebase:', firebaseAvailable ? 'Connected 🔥' : 'Offline 📴');
        
    } catch (error) {
        console.error('❌ Error initializing app:', error);
        showErrorState();
    }
}

function showLoadingState() {
    const grid = document.getElementById('photoGrid');
    grid.innerHTML = '<div class="loading">Memuat foto</div>';
}

function showErrorState() {
    const grid = document.getElementById('photoGrid');
    grid.innerHTML = `
        <div class="empty-state">
            <div class="emoji">⚠️</div>
            <h3>Error Memuat Database</h3>
            <p>Silakan refresh halaman atau clear browser cache</p>
        </div>
    `;
}

// ========================================
// DRAG & DROP SETUP
// ========================================

function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('dragover');
        }, false);
    });

    uploadArea.addEventListener('drop', handleDrop, false);
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
}

// ========================================
// FILE INPUT SETUP
// ========================================

function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

// ========================================
// FILE HANDLING
// ========================================

function handleFileSelect(file) {
    const mediaType = document.getElementById('mediaType').value;
    const isVideo = mediaType === 'video';
    
    if (isVideo && !file.type.startsWith('video/')) {
        showNotification('❌ Pilih file video!', 'error');
        return;
    }
    
    if (!isVideo && !file.type.startsWith('image/')) {
        showNotification('❌ Pilih file gambar!', 'error');
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        showNotification('❌ File terlalu besar! Maksimal 10MB', 'error');
        return;
    }

    selectedFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        showPreview(e.target.result, isVideo, file);
    };
    
    reader.onerror = () => {
        showNotification('❌ Error membaca file!', 'error');
        selectedFile = null;
    };
    
    reader.readAsDataURL(file);
}

function showPreview(dataUrl, isVideo, file) {
    const previewContainer = document.getElementById('previewContainer');
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    
    if (isVideo) {
        previewContainer.innerHTML = `
            <div style="margin-top: 15px; padding: 15px; background: #f0f9ff; border-radius: 10px;">
                <p style="color: #4CAF50; font-weight: 600; margin-bottom: 5px;">✓ Video dipilih</p>
                <p style="font-size: 0.9em; color: #666;">${file.name}</p>
                <p style="font-size: 0.85em; color: #999; margin-top: 5px;">Ukuran: ${sizeMB} MB</p>
            </div>
        `;
    } else {
        previewContainer.innerHTML = `
            <div style="margin-top: 15px;">
                <img src="${dataUrl}" class="preview-image" alt="Preview">
                <div style="margin-top: 10px; padding: 10px; background: #f0f9ff; border-radius: 8px;">
                    <p style="color: #4CAF50; font-weight: 600; margin-bottom: 3px;">✓ Foto siap diupload!</p>
                    <p style="font-size: 0.85em; color: #999;">Ukuran: ${sizeMB} MB</p>
                </div>
            </div>
        `;
    }
    
    document.getElementById('submitBtn').disabled = false;
}

// ========================================
// PHOTO FILTERING
// ========================================

function getFilteredPhotos() {
    if (currentFilter === 'all') {
        return allPhotos;
    }
    
    if (currentFilter === 'video') {
        return allPhotos.filter(p => p.type === 'video');
    }
    
    return allPhotos.filter(p => p.category === currentFilter);
}

function filterPhotos(filter) {
    currentFilter = filter;
    currentPage = 1;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    renderPhotos();
}

// ========================================
// RENDER PHOTOS
// ========================================

function renderPhotos() {
    const grid = document.getElementById('photoGrid');
    const filtered = getFilteredPhotos();
    
    if (filtered.length === 0) {
        showEmptyState();
        updatePagination(0);
        return;
    }

    const totalPages = Math.ceil(filtered.length / PHOTOS_PER_PAGE);
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    
    const startIdx = (currentPage - 1) * PHOTOS_PER_PAGE;
    const endIdx = startIdx + PHOTOS_PER_PAGE;
    const pagePhotos = filtered.slice(startIdx, endIdx);

    grid.innerHTML = pagePhotos.map(photo => createPhotoCard(photo)).join('');
    
    updatePagination(totalPages);
}

function createPhotoCard(photo) {
    const escapedCaption = escapeHtml(photo.caption);
    
    if (photo.type === 'video') {
        return `
            <div class="photo-card video-card">
                <button class="delete-btn" onclick="deletePhoto(${photo.id})" title="Hapus video">×</button>
                <div class="video-wrapper">
                    <video controls>
                        <source src="${photo.data}" type="video/mp4">
                        Browser Anda tidak mendukung video.
                    </video>
                </div>
                <div class="photo-caption">${escapedCaption}</div>
            </div>
        `;
    }
    
    return `
        <div class="photo-card">
            <button class="delete-btn" onclick="deletePhoto(${photo.id})" title="Hapus foto">×</button>
            <div class="photo-wrapper">
                <img src="${photo.data}" alt="${escapedCaption}" loading="lazy">
            </div>
            <div class="photo-caption">${escapedCaption}</div>
        </div>
    `;
}

function showEmptyState() {
    const grid = document.getElementById('photoGrid');
    let message = '';
    
    if (currentFilter === 'all') {
        message = `
            <div class="emoji">📷</div>
            <h3>Belum ada foto</h3>
            <p>Klik tombol "Tambah Foto" untuk mulai mengisi kenangan</p>
        `;
    } else {
        const filterNames = {
            'her': 'Foto Dia',
            'together': 'Foto Bersama',
            'video': 'Video'
        };
        message = `
            <div class="emoji">🔍</div>
            <h3>Tidak ada ${filterNames[currentFilter]}</h3>
            <p>Coba filter lain atau tambahkan foto baru</p>
        `;
    }
    
    grid.innerHTML = `<div class="empty-state">${message}</div>`;
}

// ========================================
// PAGINATION
// ========================================

function updatePagination(totalPages) {
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (totalPages === 0) {
        pageInfo.textContent = '';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

    pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function changePage(direction) {
    const filtered = getFilteredPhotos();
    const totalPages = Math.ceil(filtered.length / PHOTOS_PER_PAGE);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderPhotos();
        
        window.scrollTo({ 
            top: 0, 
            behavior: 'smooth' 
        });
    }
}

// ========================================
// MODAL FUNCTIONS
// ========================================

function openModal() {
    const modal = document.getElementById('addModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('addModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    resetForm();
}

function resetForm() {
    const form = document.getElementById('addPhotoForm');
    form.reset();
    
    const previewContainer = document.getElementById('previewContainer');
    previewContainer.innerHTML = '';
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Simpan Kenangan ♡';
    
    const categoryGroup = document.getElementById('categoryGroup');
    categoryGroup.style.display = 'block';
    
    selectedFile = null;
}

function toggleMediaInput() {
    const type = document.getElementById('mediaType').value;
    const categoryGroup = document.getElementById('categoryGroup');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadIcon = uploadArea.querySelector('.upload-icon');
    const uploadText = uploadArea.querySelector('strong');
    
    if (type === 'video') {
        categoryGroup.style.display = 'none';
        uploadIcon.textContent = '🎥';
        uploadText.textContent = 'Klik untuk pilih video';
        fileInput.accept = 'video/*';
    } else {
        categoryGroup.style.display = 'block';
        uploadIcon.textContent = '📸';
        uploadText.textContent = 'Klik untuk pilih foto';
        fileInput.accept = 'image/*';
    }
    
    document.getElementById('previewContainer').innerHTML = '';
    document.getElementById('submitBtn').disabled = true;
    selectedFile = null;
}

// ========================================
// ADD PHOTO (WITH FIREBASE SYNC)
// ========================================

async function addPhoto(event) {
    event.preventDefault();
    
    if (!selectedFile) {
        showNotification('❌ Pilih file terlebih dahulu!', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    try {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const mediaType = document.getElementById('mediaType').value;
                const category = mediaType === 'video' ? 'video' : document.getElementById('category').value;
                const captionInput = document.getElementById('caption').value.trim();
                const caption = captionInput || 'Kenangan tanpa caption 💭';

                const photo = {
                    id: Date.now(),
                    type: mediaType,
                    category: category,
                    data: e.target.result,
                    caption: caption,
                    timestamp: Date.now(),
                    size: selectedFile.size
                };

                // Save to IndexedDB
                await savePhoto(photo);
                await loadPhotos();
                
                closeModal();
                
                currentFilter = 'all';
                currentPage = 1;
                
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                document.querySelector('.tab-btn').classList.add('active');
                
                renderPhotos();
                updateStorageInfo();
                
                // Save to Firebase Cloud
                const cloudSaved = await saveToCloud(allPhotos);
                
                if (cloudSaved) {
                    showNotification('✨ Kenangan disimpan & sync ke cloud!', 'success');
                } else {
                    showNotification('✨ Kenangan disimpan lokal!', 'success');
                }
                
            } catch (error) {
                console.error('Error saving photo:', error);
                showNotification('❌ Gagal menyimpan! Storage mungkin penuh.', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        };

        reader.onerror = () => {
            showNotification('❌ Error membaca file!', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        };

        reader.readAsDataURL(selectedFile);
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Terjadi kesalahan!', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// ========================================
// DELETE PHOTO (WITH FIREBASE SYNC)
// ========================================

async function deletePhoto(id) {
    const photo = allPhotos.find(p => p.id === id);
    const mediaType = photo && photo.type === 'video' ? 'video' : 'foto';
    
    if (!confirm(`Hapus ${mediaType} ini? 🥺\n\nTindakan ini akan menghapus dari semua device!`)) {
        return;
    }

    try {
        // Delete from IndexedDB
        await deletePhotoFromDB(id);
        await loadPhotos();
        
        const filtered = getFilteredPhotos();
        const totalPages = Math.ceil(filtered.length / PHOTOS_PER_PAGE);
        
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        }
        
        renderPhotos();
        updateStorageInfo();
        
        // Sync delete to Firebase
        await saveToCloud(allPhotos);
        
        showNotification(`🗑️ ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} dihapus & sync!`, 'info');
        
    } catch (error) {
        console.error('Error deleting photo:', error);
        showNotification('❌ Gagal menghapus foto!', 'error');
    }
}

// ========================================
// STORAGE INFO
// ========================================

function updateStorageInfo() {
    const storageInfo = document.getElementById('storageInfo');
    
    if (allPhotos.length === 0) {
        storageInfo.innerHTML = '';
        return;
    }

    const totalSize = allPhotos.reduce((sum, photo) => sum + (photo.size || 0), 0);
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    const photoCount = allPhotos.filter(p => p.type !== 'video').length;
    const videoCount = allPhotos.filter(p => p.type === 'video').length;
    
    let countText = [];
    if (photoCount > 0) countText.push(`${photoCount} foto`);
    if (videoCount > 0) countText.push(`${videoCount} video`);
    
    storageInfo.innerHTML = `
        📊 Total: ${countText.join(' · ')} | Storage: ${sizeInMB} MB
    `;
}

// ========================================
// EXPORT DATA (BACKUP)
// ========================================

function exportData() {
    if (allPhotos.length === 0) {
        showNotification('❌ Tidak ada data untuk di-backup!', 'error');
        return;
    }

    try {
        const dataStr = JSON.stringify(allPhotos, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        
       // ✅ BENAR
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        link.download = `our-memories-backup-${dateStr}-${timeStr}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showNotification(`✅ Backup berhasil! ${allPhotos.length} kenangan di-download`, 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('❌ Gagal membuat backup!', 'error');
    }
}

// ========================================
// IMPORT DATA (RESTORE)
// ========================================

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importedPhotos = JSON.parse(text);
            
            if (!Array.isArray(importedPhotos)) {
                throw new Error('Invalid backup format');
            }
            
            const confirm = window.confirm(
                `Import ${importedPhotos.length} kenangan?\n\n` +
                `Data akan digabung dengan data yang sudah ada.`
            );
            
            if (!confirm) return;
            
            // Merge dengan data existing
            const photoMap = new Map();
            allPhotos.forEach(photo => photoMap.set(photo.id, photo));
            importedPhotos.forEach(photo => photoMap.set(photo.id, photo));
            
            const mergedPhotos = Array.from(photoMap.values()).sort((a, b) => b.timestamp - a.timestamp);
            
            // Clear dan save semua
            await clearAllPhotos();
            for (const photo of mergedPhotos) {
                await savePhoto(photo);
            }
            
            allPhotos = mergedPhotos;
            
            // Sync ke Firebase
            await saveToCloud(allPhotos);
            
            currentFilter = 'all';
            currentPage = 1;
            
            renderPhotos();
            updateStorageInfo();
            
            showNotification(`✅ Import berhasil! Total: ${mergedPhotos.length} kenangan`, 'success');
            
        } catch (error) {
            console.error('Error importing data:', error);
            showNotification('❌ File backup tidak valid!', 'error');
        }
    };
    
    input.click();
}

// ========================================
// CLEAR ALL DATA
// ========================================

async function clearAllData() {
    if (allPhotos.length === 0) {
        showNotification('❌ Tidak ada data untuk dihapus!', 'error');
        return;
    }

    const confirm = window.confirm(
        `⚠️ PERINGATAN!\n\n` +
        `Hapus SEMUA ${allPhotos.length} kenangan?\n\n` +
        `Tindakan ini akan menghapus semua foto & video dari semua device dan TIDAK BISA dibatalkan!\n\n` +
        `Pastikan Anda sudah backup data!`
    );
    
    if (!confirm) return;
    
    const doubleConfirm = window.confirm(
        `Yakin 100% ingin menghapus semua kenangan? 🥺`
    );
    
    if (!doubleConfirm) return;

    try {
        await clearAllPhotos();
        allPhotos = [];
        
        // Clear Firebase
        await saveToCloud([]);
        
        currentFilter = 'all';
        currentPage = 1;
        
        renderPhotos();
        updateStorageInfo();
        
        showNotification('🗑️ Semua data berhasil dihapus!', 'info');
        
    } catch (error) {
        console.error('Error clearing data:', error);
        showNotification('❌ Gagal menghapus data!', 'error');
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ESC to close modal
        if (e.key === 'Escape') {
            const modal = document.getElementById('addModal');
            if (modal.classList.contains('active')) {
                closeModal();
            }
        }
        
        // Ctrl/Cmd + K to open add modal
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            openModal();
        }
        
        // Arrow keys for pagination
        if (!document.getElementById('addModal').classList.contains('active')) {
            if (e.key === 'ArrowLeft') {
                const prevBtn = document.getElementById('prevBtn');
                if (!prevBtn.disabled) changePage(-1);
            }
            if (e.key === 'ArrowRight') {
                const nextBtn = document.getElementById('nextBtn');
                if (!nextBtn.disabled) changePage(1);
            }
        }
    });
}

// ========================================
// CLICK OUTSIDE TO CLOSE MODAL
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('addModal');
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
});

// ========================================
// START APP
// ========================================

document.addEventListener('DOMContentLoaded', initApp);