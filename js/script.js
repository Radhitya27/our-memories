// Configuration
const PHOTOS_PER_PAGE = 10;
let currentPage = 1;
let currentFilter = 'all';
let allPhotos = [];

// Initialize app
async function initApp() {
    try {
        const stored = localStorage.getItem('memories-photos');
        if (stored) {
            allPhotos = JSON.parse(stored);
        } else {
            // Sample data untuk demo
            allPhotos = [
                { id: 1, type: 'photo', url: '', category: 'her', caption: 'Senyummu yang selalu bikin hari cerah ☀️', emoji: '😊' },
                { id: 2, type: 'photo', url: '', category: 'her', caption: 'Cantiknya kamu hari ini 💕', emoji: '🌸' },
                { id: 3, type: 'photo', url: '', category: 'together', caption: 'Momen pertama kita 👫', emoji: '💑' },
                { id: 4, type: 'photo', url: '', category: 'her', caption: 'Gak sadar difoto tapi tetep cantik', emoji: '📸' },
                { id: 5, type: 'photo', url: '', category: 'together', caption: 'Kenangan yang tak terlupakan', emoji: '💝' },
                { id: 6, type: 'photo', url: '', category: 'her', caption: 'Lucu banget sih! 🥰', emoji: '🌺' },
                { id: 7, type: 'video', url: '', category: 'together', caption: 'Video kita yang lucu 😄', emoji: '🎬' },
                { id: 8, type: 'photo', url: '', category: 'her', caption: 'Pose favorit! ✨', emoji: '⭐' },
                { id: 9, type: 'photo', url: '', category: 'together', caption: 'Moments with you 💕', emoji: '💞' },
                { id: 10, type: 'photo', url: '', category: 'her', caption: 'Beautiful as always', emoji: '🌹' }
            ];
            savePhotos();
        }
    } catch (error) {
        console.log('Using demo data');
        allPhotos = [
            { id: 1, type: 'photo', url: '', category: 'her', caption: 'Senyummu yang selalu bikin hari cerah ☀️', emoji: '😊' },
            { id: 2, type: 'photo', url: '', category: 'her', caption: 'Cantiknya kamu hari ini 💕', emoji: '🌸' },
            { id: 3, type: 'photo', url: '', category: 'together', caption: 'Momen pertama kita 👫', emoji: '💑' }
        ];
    }
    renderPhotos();
}

// Save photos to localStorage
function savePhotos() {
    try {
        localStorage.setItem('memories-photos', JSON.stringify(allPhotos));
    } catch (error) {
        console.error('Error saving photos:', error);
    }
}

// Get filtered photos based on current filter
function getFilteredPhotos() {
    if (currentFilter === 'all') return allPhotos;
    if (currentFilter === 'video') {
        return allPhotos.filter(p => p.type === 'video');
    }
    return allPhotos.filter(p => p.category === currentFilter);
}

// Render photos to grid
function renderPhotos() {
    const grid = document.getElementById('photoGrid');
    const filtered = getFilteredPhotos();
    
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📷</div>
                <h3>Belum ada foto</h3>
                <p>Klik tombol "Tambah Foto" untuk mulai mengisi kenangan</p>
            </div>
        `;
        updatePagination(0);
        return;
    }

    const totalPages = Math.ceil(filtered.length / PHOTOS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIdx = (currentPage - 1) * PHOTOS_PER_PAGE;
    const endIdx = startIdx + PHOTOS_PER_PAGE;
    const pagePhotos = filtered.slice(startIdx, endIdx);

    grid.innerHTML = pagePhotos.map(photo => {
        if (photo.type === 'video') {
            return `
                <div class="photo-card video-card" style="animation-delay: ${Math.random() * 0.3}s">
                    <button class="delete-btn" onclick="deletePhoto(${photo.id})">×</button>
                    <div class="video-wrapper">
                        ${photo.url ? `<video controls><source src="${photo.url}"></video>` : `<div class="photo-placeholder">${photo.emoji || '🎥'}</div>`}
                    </div>
                    <div class="photo-caption">${photo.caption}</div>
                </div>
            `;
        }
        return `
            <div class="photo-card" style="animation-delay: ${Math.random() * 0.3}s">
                <button class="delete-btn" onclick="deletePhoto(${photo.id})">×</button>
                <div class="photo-wrapper">
                    ${photo.url ? `<img src="${photo.url}" alt="${photo.caption}">` : `<div class="photo-placeholder">${photo.emoji || '📷'}</div>`}
                </div>
                <div class="photo-caption">${photo.caption}</div>
            </div>
        `;
    }).join('');

    updatePagination(totalPages);
}

// Update pagination controls
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

// Change page
function changePage(direction) {
    const filtered = getFilteredPhotos();
    const totalPages = Math.ceil(filtered.length / PHOTOS_PER_PAGE);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderPhotos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Filter photos by category
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

// Modal functions
function openModal() {
    document.getElementById('addModal').classList.add('active');
}

function closeModal() {
    document.getElementById('addModal').classList.remove('active');
    document.getElementById('addPhotoForm').reset();
}

function toggleMediaInput() {
    const type = document.getElementById('mediaType').value;
    const categoryGroup = document.getElementById('category').parentElement;
    
    if (type === 'video') {
        categoryGroup.style.display = 'none';
    } else {
        categoryGroup.style.display = 'block';
    }
}

// Add new photo
async function addPhoto(event) {
    event.preventDefault();
    
    const type = document.getElementById('mediaType').value;
    const url = document.getElementById('mediaUrl').value;
    const category = type === 'video' ? 'together' : document.getElementById('category').value;
    const caption = document.getElementById('caption').value || 'Kenangan indah ❤️';
    
    const newPhoto = {
        id: Date.now(),
        type,
        url,
        category,
        caption,
        emoji: type === 'video' ? '🎥' : (category === 'her' ? '💕' : '👫')
    };
    
    allPhotos.unshift(newPhoto);
    savePhotos();
    
    closeModal();
    currentPage = 1;
    currentFilter = 'all';
    
    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.tab-btn').classList.add('active');
    
    renderPhotos();
}

// Delete photo
async function deletePhoto(id) {
    if (confirm('Yakin mau hapus kenangan ini? 🥺')) {
        allPhotos = allPhotos.filter(p => p.id !== id);
        savePhotos();
        renderPhotos();
    }
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('addModal').addEventListener('click', (e) => {
        if (e.target.id === 'addModal') {
            closeModal();
        }
    });
    
    // Initialize app
    initApp();
});