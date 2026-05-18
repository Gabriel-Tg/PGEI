import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

<<<<<<< HEAD
function resolveCacheScope(value) {
	try {
		const hostname = new URL(value).hostname || '';
		return hostname.split('.')[0] || 'default';
	} catch {
		return 'default';
	}
}

export const SUPABASE_CACHE_SCOPE = resolveCacheScope(url);

export const supabase = createClient(url, anon);

let anonymousSessionPromise = null;
let anonymousSignInDisabledWarned = false;

function isAnonymousSignInDisabledError(error) {
	const message = String(error?.message || '').toLowerCase();
	return message.includes('anonymous sign-ins are disabled');
}

export async function ensureAnonymousSession() {
	const {
		data: { session },
		error: sessionError,
	} = await supabase.auth.getSession();

	if (sessionError) throw sessionError;
	if (session) return session;

	if (!anonymousSessionPromise) {
		anonymousSessionPromise = supabase.auth
			.signInAnonymously()
			.then(({ data, error }) => {
				if (error) {
					if (isAnonymousSignInDisabledError(error)) {
						if (!anonymousSignInDisabledWarned) {
							console.info('Supabase: anonymous sign-ins desabilitado; continuando com a role anon da chave publica.');
							anonymousSignInDisabledWarned = true;
						}
						return null;
					}
					throw error;
				}
				return data?.session || null;
			})
			.catch((error) => {
				if (isAnonymousSignInDisabledError(error)) {
					if (!anonymousSignInDisabledWarned) {
						console.info('Supabase: anonymous sign-ins desabilitado; continuando com a role anon da chave publica.');
						anonymousSignInDisabledWarned = true;
					}
					return null;
				}
				throw error;
			})
			.finally(() => {
				anonymousSessionPromise = null;
			});
	}

	return anonymousSessionPromise;
}
=======
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
>>>>>>> e94e21c436e733dd65724ac1211f903d57584a3f
