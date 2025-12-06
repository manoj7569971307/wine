import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBf-dvyFjMttuLD43V4MBBRbuvfbwBRKsI",
    authDomain: "wines-sheet.firebaseapp.com",
    projectId: "wines-sheet",
    storageBucket: "wines-sheet.firebasestorage.app",
    messagingSenderId: "313820033015",
    appId: "1:313820033015:web:75cc4ccf84217324bf08f2"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const username = formData.get('username') as string;
        const password = formData.get('password') as string;
        const feedback = formData.get('feedback') as string;
        const images = formData.getAll('images') as File[];

        if (!username || !password || !feedback) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const imageUrls = await Promise.all(
            images.map(async (img) => {
                const buffer = await img.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                return `data:${img.type};base64,${base64}`;
            })
        );

        await addDoc(collection(db, 'feedbacks'), {
            username,
            password,
            feedback,
            images: imageUrls,
            phone: '7569971307',
            timestamp: serverTimestamp(),
            createdAt: new Date().toISOString()
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error sending feedback:', error);
        return NextResponse.json(
            { error: 'Failed to send feedback' },
            { status: 500 }
        );
    }
}
