import { cookies } from 'next/headers';

export const DEFAULTS = {
    '1tamilmv': 'https://1tamilmv.do',
    '1tamilblasters': 'https://1tamilblasters.business',
    'tpb': 'https://thepibay.site',
    '1337x': 'https://1337x.to',
    'rutracker': 'rutracker.org'
};

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


export type DomainKey = keyof typeof DEFAULTS;

export async function getDomain(key: DomainKey): Promise<string> {
    try {
        const cookieStore = await cookies();
        const configCookie = cookieStore.get('domain_config');
        if (configCookie) {
            const config = JSON.parse(decodeURIComponent(configCookie.value));
            if (config[key]) return config[key];
        }
    } catch (e) {
        console.error('[Config] Failed to read domain config from cookies:', e);
    }
    return DEFAULTS[key];
}
