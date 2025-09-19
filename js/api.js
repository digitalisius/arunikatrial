import { collection, addDoc, onSnapshot, query, Timestamp, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase-config.js';

export function listenToTransactions(userId, onDataUpdate) {
    if (!userId) return null;
    const q = query(collection(db, 'users', userId, 'transactions'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const transactions = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            tanggal: doc.data().tanggal.toDate(),
            createdAt: doc.data().createdAt?.toDate()
        }));
        onDataUpdate(transactions);
    }, (error) => {
        console.error("Gagal mengambil data transaksi:", error);
        onDataUpdate([]); // Send empty array on error
    });

    return unsubscribe;
}

function compressImage(file, maxSizeInKB = 200, quality = 0.9) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onerror = error => reject(error);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onerror = error => reject(error);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                const MAX_WIDTH = 1280;
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas to Blob conversion failed'));
                        return;
                    }
                    if (blob.size / 1024 <= maxSizeInKB || quality <= 0.15) {
                        resolve(blob);
                    } else {
                        resolve(compressImage(file, maxSizeInKB, quality - 0.1));
                    }
                }, 'image/jpeg', quality);
            };
        };
    });
}

async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    if (data.secure_url) {
        return data.secure_url;
    } else {
        throw new Error('Cloudinary upload failed: ' + (data.error?.message || 'Unknown error'));
    }
}

export async function saveTransaction(userId, transactionData, editingId) {
    let fotoUrl = transactionData.existingFotoUrl || null;
    if (transactionData.fotoFile) {
        const compressedFile = await compressImage(transactionData.fotoFile);
        fotoUrl = await uploadToCloudinary(compressedFile);
    }
    
    const dataToSave = {
        ...transactionData,
        foto: fotoUrl,
        tanggal: Timestamp.fromDate(new Date(transactionData.tanggal)),
        updatedAt: Timestamp.now()
    };
    // Clean up temporary properties before saving
    delete dataToSave.fotoFile;
    delete dataToSave.existingFotoUrl;

    if (editingId) {
        await updateDoc(doc(db, 'users', userId, 'transactions', editingId), dataToSave);
    } else {
        dataToSave.createdAt = Timestamp.now();
        await addDoc(collection(db, 'users', userId, 'transactions'), dataToSave);
    }
}

export async function deleteTransaction(userId, transactionId) {
    await deleteDoc(doc(db, 'users', userId, 'transactions', transactionId));
}

