const reservedRoutes = new Set([
	'directory',
	'downloads',
	'drops',
	'following',
	'friends',
	'inventory',
	'jobs',
	'login',
	'logout',
	'messages',
	'moderator',
	'payments',
	'p',
	'popout',
	'embed',
	'prime',
	'products',
	'search',
	'settings',
	'signup',
	'store',
	'subscriptions',
	'turbo',
	'videos',
	'wallet'
])

export function checkChannel(source, url, senderUrl = url) {
	if (source !== 'chat') return null
	let page

	try {
		page = new URL(url)
		if (page.origin !== new URL(senderUrl).origin) return null
	} catch {
		return null
	}
	const { hostname, pathname } = page

	if (!['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(hostname)) return null
	const match = pathname.match(/^\/([\w]+)\/?$/) ??
		pathname.match(/^\/(?:popout|embed)\/([\w]+)\/chat\/?$/) ??
		pathname.match(/^\/moderator\/([\w]+)\/?$/)
	const login = match?.[1].toLowerCase()

	return login && !reservedRoutes.has(login) ? { login } : null
}
