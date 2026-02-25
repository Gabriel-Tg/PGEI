import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
	throw new Error('Variáveis VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não configuradas.');
}

let projectRef = '';
try {
	projectRef = new URL(url).hostname.split('.')[0] || '';
} catch {
	projectRef = '';
}

const storageKey = projectRef ? `sb-${projectRef}-auth-token` : 'sb-auth-token';

if (typeof window !== 'undefined' && projectRef) {
	try {
		const cleanedFlag = `sb-cleaned-${projectRef}`;
		const alreadyCleaned = window.sessionStorage.getItem(cleanedFlag) === '1';

		if (!alreadyCleaned) {
			const keysToRemove = [];
			for (let i = 0; i < window.localStorage.length; i++) {
				const key = window.localStorage.key(i);
				if (!key) continue;
				if (key.startsWith('sb-') && key.endsWith('-auth-token') && key !== storageKey) {
					keysToRemove.push(key);
				}
			}
			keysToRemove.forEach((key) => window.localStorage.removeItem(key));
			window.sessionStorage.setItem(cleanedFlag, '1');
		}
	} catch {
		// sem bloqueio: segue normalmente mesmo se storage não estiver disponível
	}
}

export const supabase = createClient(url, anon, {
	auth: {
		storageKey,
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
	},
});
