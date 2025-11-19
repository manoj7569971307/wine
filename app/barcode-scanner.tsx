'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { Camera, X, CheckCircle, AlertCircle } from 'lucide-react';

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    onClose: () => void;
    isOpen: boolean;
}

export default function BarcodeScanner({ onScan, onClose, isOpen }: BarcodeScannerProps) {
    const webcamRef = useRef<Webcam>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [lastScanned, setLastScanned] = useState<string>('');
    const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const startScanning = useCallback(() => {
        if (!codeReaderRef.current) {
            codeReaderRef.current = new BrowserMultiFormatReader();
        }
        setIsScanning(true);

        // Scan every 500ms
        scanIntervalRef.current = setInterval(() => {
            const imageSrc = webcamRef.current?.getScreenshot();
            if (imageSrc && codeReaderRef.current) {
                const img = new Image();
                img.src = imageSrc;
                img.onload = async () => {
                    try {
                        const result = await codeReaderRef.current!.decodeFromImageElement(img);
                        if (result) {
                            const barcodeText = result.getText();
                            if (barcodeText !== lastScanned) {
                                setLastScanned(barcodeText);
                                onScan(barcodeText);
                                setScanStatus('success');
                                setStatusMessage(`Scanned: ${barcodeText}`);
                                setTimeout(() => {
                                    setScanStatus('idle');
                                    setStatusMessage('');
                                }, 2000);
                            }
                        }
                    } catch (err) {
                        if (!(err instanceof NotFoundException)) {
                            console.error('Barcode scanning error:', err);
                        }
                    }
                };
            }
        }, 500);
    }, [lastScanned, onScan]);

    const stopScanning = useCallback(() => {
        setIsScanning(false);
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            startScanning();
        } else {
            stopScanning();
        }

        return () => {
            stopScanning();
            if (codeReaderRef.current) {
                codeReaderRef.current.reset();
            }
        };
    }, [isOpen, startScanning, stopScanning]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full overflow-hidden">
                <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Camera className="w-6 h-6" />
                        <h2 className="text-xl font-bold">Scan Bottle Barcode</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-blue-700 rounded-full p-2 transition"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="relative bg-black rounded-lg overflow-hidden mb-4">
                        <Webcam
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            videoConstraints={{
                                facingMode: 'environment',
                                width: 1280,
                                height: 720
                            }}
                            className="w-full h-auto"
                        />

                        {/* Scanning overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="border-4 border-green-500 rounded-lg w-64 h-48 opacity-50"></div>
                        </div>

                        {/* Status indicator */}
                        {isScanning && (
                            <div className="absolute top-4 left-4 bg-green-600 text-white px-3 py-2 rounded-lg flex items-center gap-2">
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                <span className="text-sm font-medium">Scanning...</span>
                            </div>
                        )}
                    </div>

                    {/* Status messages */}
                    {scanStatus === 'success' && statusMessage && (
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg mb-4">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-medium">{statusMessage}</span>
                        </div>
                    )}

                    {scanStatus === 'error' && statusMessage && (
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg mb-4">
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-medium">{statusMessage}</span>
                        </div>
                    )}

                    <div className="text-center text-gray-600">
                        <p className="text-sm">Position the barcode within the green frame</p>
                        <p className="text-xs mt-1">The scanner will automatically detect and read barcodes</p>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all"
                        >
                            Close Scanner
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
