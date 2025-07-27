// app.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCtAp1dR5q8JdbpYhNPkDTCVsQrLuBVT14",
    authDomain: "weddingseat-c5458.firebaseapp.com",
    projectId: "weddingseat-c5458",
    storageBucket: "weddingseat-c5458.firebasestorage.app",
    messagingSenderId: "445507115221",
    appId: "1:445507115221:web:ef0df7c0a4743f5a4dea5c",
    measurementId: "G-BT3EP59P46"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Data Store
let dataStore = {
    guests: [],
    tables: []
};

// Utility Functions
function getFullName(guest) {
    return `${guest.first_name || ''} ${guest.last_name || ''}`.trim() || 'Unnamed Guest';
}

function saveData(collectionName, data) {
    if (data.id) {
        setDoc(doc(db, collectionName, data.id), data, { merge: true });
    } else {
        const docRef = doc(collection(db, collectionName));
        setDoc(docRef, data);
    }
}

function deleteData(collectionName, id) {
    deleteDoc(doc(db, collectionName, id));
}

// Sync Data with Firestore
function syncData() {
    onSnapshot(collection(db, 'guests'), (snapshot) => {
        dataStore.guests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardStats();
    });
    onSnapshot(collection(db, 'tables'), (snapshot) => {
        dataStore.tables = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardStats();
    });
}

// Load Page Function
function loadPage(page) {
    const contentDiv = document.getElementById('pageContent');
    fetch(page + '.html')
        .then(response => {
            if (!response.ok) throw new Error('Page not found');
            return response.text();
        })
        .then(html => {
            contentDiv.innerHTML = html;
            const actionMap = {
                'Upload Guest List (CSV)': 'upload',
                'Manage Guests Manually': 'guests',
                'Design Table Layout': 'layout',
                'Guest Search Portal': 'guestsearch'
            };
            contentDiv.querySelectorAll('.action-buttons a').forEach(link => {
                const actionText = link.textContent.trim();
                const pageToLoad = actionMap[actionText] || actionText.toLowerCase().replace(' ', '');
                link.setAttribute('onclick', `loadPage('${pageToLoad}')`);
                link.removeAttribute('href');
            });
            contentDiv.querySelectorAll('.action-buttons a').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const pageToLoad = link.getAttribute('onclick').match(/loadPage\('([^']+)'\)/)[1];
                    loadPage(pageToLoad);
                });
            });
            document.querySelectorAll('.sidebar .menu a').forEach(a => a.classList.remove('active'));
            document.querySelector(`.sidebar .menu a[onclick="loadPage('${page}')"]`).classList.add('active');
        })
        .catch(error => {
            console.error('Error loading page:', error);
            contentDiv.innerHTML = '<h3>Error</h3><p>Page not found. Please check the file or create it.</p>';
        });
}

// Update Dashboard Stats (for dashboard.html)
function updateDashboardStats() {
    const totalGuests = dataStore.guests.length;
    const confirmedGuests = dataStore.guests.filter(g => g.rsvp_status === 'confirmed').length;
    const pendingGuests = dataStore.guests.filter(g => g.rsvp_status === 'pending').length;
    const totalTables = dataStore.tables.length;

    if (document.getElementById('totalGuests')) document.getElementById('totalGuests').textContent = totalGuests || 0;
    if (document.getElementById('confirmedGuests')) document.getElementById('confirmedGuests').textContent = confirmedGuests || 0;
    if (document.getElementById('pendingGuests')) document.getElementById('pendingGuests').textContent = pendingGuests || 0;
    if (document.getElementById('totalTables')) document.getElementById('totalTables').textContent = totalTables || 0;

    const activityList = document.getElementById('activityList');
    if (activityList) {
        activityList.innerHTML = '';
        dataStore.guests.slice(-5).reverse().forEach(guest => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <p>${guest.name || getFullName(guest)}</p>
                    <p>Table ${guest.table_number || 'N/A'}</p>
                </div>
                <div class="status">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${guest.rsvp_status === 'confirmed' ? '#10b981' : guest.rsvp_status === 'pending' ? '#6b7280' : '#ef4444'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="${guest.rsvp_status === 'confirmed' ? 'M22 11.08V12a10 10 0 1 1-5.93-9.14' : guest.rsvp_status === 'pending' ? 'M12 6 12 12 14 14' : 'M15 9 9 15 M15 15 9 9'}"></path>
                        ${guest.rsvp_status === 'confirmed' ? '<polyline points="22 4 12 14.01 9 11.01"></polyline>' : ''}
                    </svg>
                </div>
            `;
            activityList.appendChild(li);
        });
    }
}

// Upload Page Logic
function setupUploadPage() {
    const uploadArea = document.getElementById('uploadArea');
    const fileName = document.getElementById('fileName');
    const fileStatus = document.getElementById('fileStatus');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const processBtn = document.getElementById('processBtn');
    const progress = document.getElementById('progress');
    const progressBar = document.getElementById('progressBar');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    const successCard = document.getElementById('successCard');
    const successCount = document.getElementById('successCount');
    const summaryText = document.getElementById('summaryText');
    const guestList = document.getElementById('guestList');

    let file = null;
    let uploading = false;

    // Drag and Drop Events
    uploadArea.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('drag-active');
        console.log('Drag enter detected');
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('drag-active');
        console.log('Drag leave detected');
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('drag-active');
        console.log('Drag over detected');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('drag-active');
        const files = e.dataTransfer.files;
        console.log('Files dropped:', files);
        handleFileSelection(files);
    });

    // Click to Select File
    selectFileBtn.addEventListener('click', () => {
        console.log('Select CSV File button clicked');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            console.log('File input changed:', e.target.files);
            const files = e.target.files;
            handleFileSelection(files);
        };
        input.click();
    });

    // Handle File Selection
    function handleFileSelection(files) {
        if (files && files.length > 0 && files[0].type === 'text/csv') {
            file = files[0];
            fileName.textContent = file.name;
            fileStatus.textContent = 'File selected';
            errorAlert.style.display = 'none';
            processBtn.disabled = false;
            console.log('File selected:', file.name);
        } else {
            showError('Please select a valid CSV file');
            console.log('Invalid file selected');
        }
    }

    // Process Button Event
    processBtn.addEventListener('click', () => {
        console.log('Process button clicked, file:', file);
        if (file) {
            uploading = true;
            progress.style.display = 'block';
            processBtn.disabled = true;
            uploadCSV();
        } else {
            showError('No file selected');
        }
    });

    // Error Handling
    function showError(message) {
        errorMessage.textContent = message;
        errorAlert.style.display = 'flex';
        processBtn.disabled = true;
        console.error('Error:', message);
    }

    // Upload CSV to Firebase Storage
    function uploadCSV() {
        if (!storage) {
            showError('Firebase Storage is not initialized. Check index.html');
            return;
        }
        const storageRef = ref(storage, `uploads/${file.name}_${Date.now()}.csv`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progressValue = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = `${progressValue}%`;
                console.log('Upload progress:', progressValue + '%');
            },
            (error) => {
                showError('Upload failed: ' + error.message);
                uploading = false;
                progress.style.display = 'none';
            },
            () => {
                getDownloadURL(storageRef).then((downloadURL) => {
                    console.log('File uploaded, URL:', downloadURL);
                    processCSVFile(downloadURL);
                });
            }
        );
    }

    // Process CSV File
    function processCSVFile(url) {
        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch CSV: ' + response.statusText);
                return response.text();
            })
            .then(text => {
                const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim()));
                const headers = rows[0].map(header => header.toLowerCase());
                const data = rows.slice(1).filter(row => row.length === headers.length && row[0]); // Filter out empty rows

                const guests = data.map((row, index) => {
                    const guest = {};
                    headers.forEach((header, i) => {
                        if (header === 'rsvp status' && !row[i]) {
                            guest.rsvp_status = 'pending';
                        } else if (header === 'table' && row[i]) {
                            guest.table_number = parseInt(row[i], 10);
                        } else if (header === 'first name') {
                            guest.first_name = row[i] || null;
                        } else if (header === 'last name') {
                            guest.last_name = row[i] || null;
                        } else if (header === 'email') {
                            guest.email = row[i] || null;
                        } else if (header === 'phone') {
                            guest.phone = row[i] || null;
                        }
                        guest.name = `${guest.first_name || ''} ${guest.last_name || ''}`.trim() || `Guest ${index + 1}`;
                    });
                    return guest;
                });

                const batch = db.batch();
                guests.forEach(guest => {
                    const docRef = doc(db, 'guests', guest.name + '_' + index); // Unique doc ID
                    batch.set(docRef, guest);
                });
                return batch.commit();
            })
            .then(() => {
                progressBar.style.width = '100%';
                updateSuccessCard(guests);
                uploading = false;
                progress.style.display = 'none';
                successCard.style.display = 'block';
                uploadArea.style.display = 'none';
                console.log('CSV processed and saved to Firestore');
            })
            .catch(error => {
                showError('Error processing CSV: ' + error.message);
                uploading = false;
                progress.style.display = 'none';
            });
    }

    // Update Success Card
    function updateSuccessCard(guests) {
        successCount.textContent = `${guests.length} guests have been added to your wedding list`;
        summaryText.textContent = `✅ ${guests.length} guests imported successfully`;
        guestList.innerHTML = guests.map(guest => `
            <div><span>${guest.name}</span><span>${guest.email || 'N/A'}</span></div>
        `).join('');
    }
}

// Initialize Page When Loaded
if (document.getElementById('uploadArea')) {
    setupUploadPage();
    console.log('Upload page initialized');
}
