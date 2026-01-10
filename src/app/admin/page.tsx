'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function AdminPage() {
    const [domains, setDomains] = useState({
        '1tamilmv': 'https://1tamilmv.do',
        'tpb': 'https://thepibay.site',
        '1337x': 'https://1337x.to',
        'rutracker': 'rutracker.org'
    });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('domain_config');
        if (stored) {
            try {
                setDomains({ ...domains, ...JSON.parse(stored) });
            } catch (e) { }
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem('domain_config', JSON.stringify(domains));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = () => {
        const defaults = {
            '1tamilmv': 'https://1tamilmv.do',
            'tpb': 'https://thepibay.site',
            '1337x': 'https://1337x.to',
            'rutracker': 'rutracker.org'
        };
        setDomains(defaults);
        localStorage.setItem('domain_config', JSON.stringify(defaults));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div style={{ minHeight: '100vh', padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Settings size={28} /> Admin Panel
                </h1>
                <Link href="/search" style={{ color: '#888', display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}>
                    <Home size={18} /> Back to Search
                </Link>
            </div>

            {/* Domain Configuration */}
            <div style={{ background: '#1a1a1a', padding: '30px', borderRadius: '12px', border: '1px solid #333' }}>
                <h2 style={{ marginTop: 0, marginBottom: '25px', fontSize: '1.3rem' }}>
                    🌐 Domain Configuration
                </h2>
                <p style={{ color: '#888', marginBottom: '25px', fontSize: '0.9rem' }}>
                    Update these URLs when domains get blocked by your ISP. Changes are saved to your browser.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* 1TamilMV */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#4caf50' }}>
                            1TamilMV Domain
                        </label>
                        <input
                            type="text"
                            value={domains['1tamilmv']}
                            onChange={(e) => setDomains({ ...domains, '1tamilmv': e.target.value })}
                            placeholder="https://1tamilmv.do"
                            style={{
                                width: '100%', padding: '12px 15px', borderRadius: '8px',
                                border: '1px solid #444', background: '#222', color: '#fff',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    {/* ThePirateBay */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#ffc107' }}>
                            ThePirateBay Mirror
                        </label>
                        <input
                            type="text"
                            value={domains['tpb']}
                            onChange={(e) => setDomains({ ...domains, 'tpb': e.target.value })}
                            placeholder="https://thepibay.site"
                            style={{
                                width: '100%', padding: '12px 15px', borderRadius: '8px',
                                border: '1px solid #444', background: '#222', color: '#fff',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    {/* 1337x */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#e91e63' }}>
                            1337x Mirror
                        </label>
                        <input
                            type="text"
                            value={domains['1337x']}
                            onChange={(e) => setDomains({ ...domains, '1337x': e.target.value })}
                            placeholder="https://1337x.to"
                            style={{
                                width: '100%', padding: '12px 15px', borderRadius: '8px',
                                border: '1px solid #444', background: '#222', color: '#fff',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    {/* RuTracker */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#2196f3' }}>
                            RuTracker Domain
                        </label>
                        <input
                            type="text"
                            value={domains['rutracker']}
                            onChange={(e) => setDomains({ ...domains, 'rutracker': e.target.value })}
                            placeholder="rutracker.org"
                            style={{
                                width: '100%', padding: '12px 15px', borderRadius: '8px',
                                border: '1px solid #444', background: '#222', color: '#fff',
                                fontSize: '1rem'
                            }}
                        />
                    </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
                    <button
                        onClick={handleSave}
                        style={{
                            flex: 1, padding: '14px', background: '#4caf50', color: '#fff',
                            border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                    >
                        <Save size={18} /> {saved ? '✓ Saved!' : 'Save Changes'}
                    </button>
                    <button
                        onClick={handleReset}
                        style={{
                            padding: '14px 20px', background: '#333', color: '#fff',
                            border: '1px solid #555', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                    >
                        <RefreshCw size={18} /> Reset Defaults
                    </button>
                </div>
            </div>

            {/* Info Box */}
            <div style={{ marginTop: '30px', background: '#1e3a5f', padding: '20px', borderRadius: '8px', border: '1px solid #2196f3' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#2196f3' }}>💡 Tips</h3>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#aaa', lineHeight: '1.8' }}>
                    <li>Find working mirrors by searching "1337x proxy" or "piratebay mirror" on Google.</li>
                    <li>Include the full URL with <code style={{ background: '#333', padding: '2px 6px', borderRadius: '4px' }}>https://</code></li>
                    <li>For RuTracker, just the domain name works (e.g., <code style={{ background: '#333', padding: '2px 6px', borderRadius: '4px' }}>rutracker.net</code>)</li>
                </ul>
            </div>
        </div>
    );
}
