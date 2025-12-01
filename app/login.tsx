'use client';

import { useState } from 'react';
import { User, Store, Lock, Mail } from 'lucide-react';

interface LoginProps {
    onLoginSuccess: (roleName: string, username: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [selectedRole, setSelectedRole] = useState('');
    const [error, setError] = useState('');

    const roles = [
        { id: 'admin', name: 'Admin', icon: User, color: 'from-purple-500 to-purple-700' },
        { id: 'shopowner', name: 'Shop Owner', icon: Store, color: 'from-blue-500 to-blue-700' },
    ];

    const handleSubmit = (e: any) => {
        e.preventDefault();
        if (!selectedRole) {
            setError('Please select a role');
            return;
        }
        if (!username || !password) {
            setError('Please fill in all fields');
            return;
        }

        // Authentication with hardcoded credentials
        let isValid = false;

        if (selectedRole === 'admin') {
            // Admin credentials
            if (username === 'admin' && password === 'GOPI') {
                isValid = true;
            }
        } else if (selectedRole === 'shopowner') {
            // Shop owner credentials (30 shops)
            const shopOwners = Array.from({ length: 30 }, (_, i) => ({
                username: `shop${i + 1}`,
                password: `shop_${i + 1}`
            }));

            isValid = shopOwners.some(
                owner => owner.username === username && owner.password === password
            );
        }

        if (!isValid) {
            setError('Invalid username or password');
            return;
        }

        setError('');

        // Call the parent's login success handler
        if (onLoginSuccess) {
            const roleName = roles.find(r => r.id === selectedRole)?.name ?? "";
            onLoginSuccess(roleName, username);
        }

        console.log('Login successful:', { username, role: selectedRole });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white text-center">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <Lock className="w-10 h-10 text-indigo-600" />
                    </div>
                    <h2 className="text-3xl font-bold">Welcome Back</h2>
                    <p className="text-indigo-100 mt-2">Sign in to your account</p>
                </div>

                {/* Form */}
                <div className="p-8">
                    <div className="space-y-6">
                        {/* Role Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Select Your Role
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {roles.map((role) => {
                                    const Icon = role.icon;
                                    return (
                                        <button
                                            key={role.id}
                                            type="button"
                                            onClick={() => setSelectedRole(role.id)}
                                            className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                                                selectedRole === role.id
                                                    ? `border-transparent bg-gradient-to-br ${role.color} text-white shadow-lg scale-105`
                                                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:shadow'
                                            }`}
                                        >
                                            <Icon className="w-6 h-6 mx-auto mb-2" />
                                            <p className="text-xs font-semibold">{role.name}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Username Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Username
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Enter your username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-gray-900"
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="password"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-gray-900"
                                />
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmit}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                        >
                            Sign In
                        </button>

                        {/* Forgot Password */}
                        <div className="text-center">
                            <a href="#" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                                Forgot your password?
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}