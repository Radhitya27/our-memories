// ========================================
// CONFIGURATION & GLOBAL VARIABLES
// ========================================

const PHOTOS_PER_PAGE = 10;
const DB_NAME = 'MemoriesDB';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

let db;
let currentPage = 1;
let currentFilter = 'all';
let allPhotos = [];
let selectedFile = null;

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
            console.log(`Loaded ${allPhotos.length} photos`);
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
        await initDB();
        await loadPhotos();
        renderPhotos();
        updateStorageInfo();
        setupDragAndDrop();
        setupFileInput();
        setupKeyboardShortcuts();
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
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
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight drop area when item is dragged over it
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

    // Handle dropped files
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
    
    // Validasi tipe file
    if (isVideo && !file.type.startsWith('video/')) {
        showNotification('❌ Pilih file video!', 'error');
        return;
    }
    
    if (!isVideo && !file.type.startsWith('image/')) {
        showNotification('❌ Pilih file gambar!', 'error');
        return;
    }

    // Validasi ukuran file
    if (file.size > MAX_FILE_SIZE) {
        showNotification('❌ File terlalu besar! Maksimal 10MB', 'error');
        return;
    }

    // File valid, simpan dan preview
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
    
    // Enable submit button
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
    
    // Update active tab
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
    
    // Jika tidak ada foto
    if (filtered.length === 0) {
        showEmptyState();
        updatePagination(0);
        return;
    }

    // Hitung pagination
    const totalPages = Math.ceil(filtered.length / PHOTOS_PER_PAGE);
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    
    const startIdx = (currentPage - 1) * PHOTOS_PER_PAGE;
    const endIdx = startIdx + PHOTOS_PER_PAGE;
    const pagePhotos = filtered.slice(startIdx, endIdx);

    // Render foto
    grid.innerHTML = pagePhotos.map(photo => createPhotoCard(photo)).join('');
    
    // Update pagination
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
        
        // Scroll to top smoothly
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
    
    // Reset preview dan file
    document.getElementById('previewContainer').innerHTML = '';
    document.getElementById('submitBtn').disabled = true;
    selectedFile = null;
}

// ========================================
// ADD PHOTO
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

                await savePhoto(photo);
                await loadPhotos();
                closeModal();
                
                // Reset ke halaman 1 dan filter "Semua"
                currentFilter = 'all';
                currentPage = 1;
                
                // Update active tab
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                document.querySelector('.tab-btn').classList.add('active');
                
                renderPhotos();
                updateStorageInfo();
                
                showNotification('✨ Kenangan berhasil disimpan!', 'success');
                
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
// DELETE PHOTO
// ========================================

async function deletePhoto(id) {
    const photo = allPhotos.find(p => p.id === id);
    const mediaType = photo && photo.type === 'video' ? 'video' : 'foto';
    
    if (!confirm(`Hapus ${mediaType} ini? 🥺\n\nTindakan ini tidak dapat dibatalkan.`)) {
        return;
    }

    try {
        await deletePhotoFromDB(id);
        await loadPhotos();
        
        // Adjust halaman jika perlu
        const filtered = getFilteredPhotos();
        const totalPages = Math.ceil(filtered.length / PHOTOS_PER_PAGE);
        
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        }
        
        renderPhotos();
        updateStorageInfo();
        showNotification(`🗑️ ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} berhasil dihapus`, 'info');
        
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
        // Convert data to JSON
        const dataStr = JSON.stringify(allPhotos, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Create download link
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        
        // Generate filename with date
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        link.download = `our-memories-backup-${dateStr}-${timeStr}.json`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        showNotification('💾 Backup berhasil diunduh!', 'success');
        
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('❌ Gagal membuat backup!', 'error');
    }
}

// ========================================
// IMPORT DATA (RESTORE)
// ========================================

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validasi tipe file
    if (!file.name.endsWith('.json')) {
        showNotification('❌ File harus berformat .json!', 'error');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            // Parse JSON
            const importedData = JSON.parse(e.target.result);
            
            // Validasi data
            if (!Array.isArray(importedData)) {
                showNotification('❌ Format file tidak valid!', 'error');
                return;
            }

            if (importedData.length === 0) {
                showNotification('❌ File backup kosong!', 'error');
                return;
            }

            // Konfirmasi import
            const confirmMsg = `Restore ${importedData.length} kenangan dari backup?\n\n` +
                              `⚠️ Foto yang sudah ada TIDAK akan dihapus.\n` +
                              `Foto dari backup akan ditambahkan.\n\n` +
                              `Lanjutkan?`;
            
            if (!confirm(confirmMsg)) {
                event.target.value = '';
                return;
            }

            // Import process
            let successCount = 0;
            let skipCount = 0;
            let errorCount = 0;
            
            for (const photo of importedData) {
                try {
                    // Cek duplikat berdasarkan ID
                    const existingPhoto = allPhotos.find(p => p.id === photo.id);
                    if (existingPhoto) {
                        skipCount++;
                        continue;
                    }

                    // Validasi required fields
                    if (!photo.id || !photo.data) {
                        skipCount++;
                        continue;
                    }

                    // Ensure timestamp exists
                    if (!photo.timestamp) {
                        photo.timestamp = photo.id || Date.now();
                    }

                    // Ensure size exists (approximate if not available)
                    if (!photo.size) {
                        photo.size = Math.floor(photo.data.length * 0.75); // rough estimate
                    }

                    await savePhoto(photo);
                    successCount++;
                    
                } catch (error) {
                    console.error('Error importing photo:', photo.id, error);
                    errorCount++;
                }
            }

            // Reload data
            await loadPhotos();
            
            // Reset view
            currentPage = 1;
            currentFilter = 'all';
            
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector('.tab-btn').classList.add('active');
            
            renderPhotos();
            updateStorageInfo();
            
            // Show result
            let message = `✅ Restore selesai!\n\n`;
            message += `📥 Berhasil: ${successCount} kenangan\n`;
            if (skipCount > 0) {
                message += `⏭️ Dilewati: ${skipCount} (duplikat/tidak valid)\n`;
            }
            if (errorCount > 0) {
                message += `❌ Error: ${errorCount}\n`;
            }
            
            alert(message);
            showNotification('📥 Restore berhasil!', 'success');
            
        } catch (error) {
            console.error('Error parsing import file:', error);
            showNotification('❌ Gagal membaca file backup! File mungkin rusak.', 'error');
        }
    };

    reader.onerror = () => {
        showNotification('❌ Error membaca file!', 'error');
    };

    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
}

// ========================================
// NOTIFICATION SYSTEM
// ========================================

function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.animation = 'slideInRight 0.3s ease-out';
    
    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
    
    // Click to dismiss
    notification.addEventListener('click', () => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    });
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('addModal');
        const isModalOpen = modal.classList.contains('active');
        
        // ESC - Close modal
        if (e.key === 'Escape' && isModalOpen) {
            closeModal();
            return;
        }
        
        // Don't trigger shortcuts if modal is open or user is typing
        if (isModalOpen || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Arrow Left - Previous page
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            changePage(-1);
        }
        
        // Arrow Right - Next page
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            changePage(1);
        }
        
        // N - New photo (open modal)
        if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            openModal();
        }
    });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('id-ID', options);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// ========================================
// ERROR HANDLING
// ========================================

window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});

// ========================================
// PAGE VISIBILITY
// ========================================

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page is visible again, reload photos if needed
        if (db) {
            loadPhotos().then(() => {
                renderPhotos();
                updateStorageInfo();
            }).catch(error => {
                console.error('Error reloading photos:', error);
            });
        }
    }
});

// ========================================
// PREVENT DATA LOSS
// ========================================

window.addEventListener('beforeunload', (e) => {
    const modal = document.getElementById('addModal');
    
    // Warn if user has unsaved changes in modal
    if (modal.classList.contains('active') && selectedFile) {
        e.preventDefault();
        e.returnValue = 'Anda memiliki foto yang belum disimpan. Yakin ingin keluar?';
        return e.returnValue;
    }
});

// ========================================
// INITIALIZE APP ON LOAD
// ========================================

window.addEventListener('load', () => {
    console.log('=================================');
    console.log('Our Memories App Starting...');
    console.log('=================================');
    initApp();
});
// ========================================
// DEVELOPMENT HELPERS (Optional)
// ========================================

window.debugApp = {
getAllPhotos: () => allPhotos,
getCurrentFilter: () => currentFilter,
getCurrentPage: () => currentPage,
clearAllData: async () => {
if (confirm('DANGER! Hapus semua data?')) {
await clearAllPhotos();
await loadPhotos();
renderPhotos();
updateStorageInfo();
console.log('All data cleared');
}
},
getStorageEstimate: async () => {
if (navigator.storage && navigator.storage.estimate) {
const estimate = await navigator.storage.estimate();
console.log('Storage estimate:', {
usage: formatFileSize(estimate.usage),
quota: formatFileSize(estimate.quota),
usagePercent: ((estimate.usage / estimate.quota) * 100).toFixed(2) + '%'
});
} else {
console.log('Storage estimation not supported');
}
}
};
console.log('Debug tools available at window.debugApp');

// ========================================
// END OF SCRIPT
// ========================================
console.log('Script loaded successfully');