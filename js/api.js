import { collection, addDoc, onSnapshot, query, Timestamp, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase-config.js';

export function listenToTransactions(userId, callback) {
    if (!userId) return null;
    const q = query(collection(db, 'users', userId, 'transactions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const transactions = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            tanggal: doc.data().tanggal.toDate(),
            createdAt: doc.data().createdAt?.toDate()
        }));
        callback(transactions);
    }, (error) => {
        console.error("Gagal mengambil data:", error);
        callback([]);
    });
    return unsubscribe;
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
        throw new Error('Cloudinary upload failed');
    }
}

function compressImage(file, maxSizeInKB = 200, quality = 0.9) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

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
                    if (blob.size / 1024 <= maxSizeInKB) {
                        resolve(blob);
                    } else {
                        if (quality > 0.15) {
                            resolve(compressImage(file, maxSizeInKB, quality - 0.1));
                        } else {
                            resolve(blob);
                        }
                    }
                }, 'image/jpeg', quality);
            };
        };
        reader.onerror = error => reject(error);
    });
}

export async function saveTransaction(userId, transactionData, editingId, oldFotoUrl) {
    let fotoUrl = oldFotoUrl || null;
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
    delete dataToSave.fotoFile;

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

