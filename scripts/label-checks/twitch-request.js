export async function requestTwitch(
	{ query, variables = {}, authenticated = false },
	{ signal, tabId },
	{ cookies = chrome.cookies, fetchRequest = fetch } = {}
) {
	if (typeof query !== 'string' || !query.trim()) throw new Error('A GraphQL query is required.')
	if (variables !== null && (typeof variables !== 'object' || Array.isArray(variables))) {
		throw new Error('GraphQL variables must be an object.')
	}
	if (!cookies?.get || !cookies?.getAllCookieStores) {
		throw new Error('Reload the extension and allow its cookies permission.')
	}
	const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(10000)])

	requestSignal.throwIfAborted()
	const stores = await cookies.getAllCookieStores()
	const store = stores.find(store => store.tabIds.includes(tabId))

	if (!store) throw new Error('Could not find the cookie store for this tab.')
	const cookie = await cookies.get({ url: 'https://www.twitch.tv/', name: 'auth-token', storeId: store.id })

	if (!cookie?.value) throw new Error('Sign in to Twitch in this browser profile before checking.')
	requestSignal.throwIfAborted()
	const request = { query, variables }
	const response = await fetchRequest('https://gql.twitch.tv/gql', {
		method: 'POST',
		headers: {
			'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
			'Content-Type': 'application/json',
			'Authorization': 'OAuth ' + cookie.value
		},
		credentials: 'omit',
		redirect: 'error',
		body: JSON.stringify(authenticated ? [request, { query: '{ currentUser { id } }' }] : request),
		signal: requestSignal
	})

	if (!response.ok) throw new Error('Twitch request failed: ' + response.status)
	const json = await response.json()
	const readData = json => {
		if (json?.errors?.length) throw new Error(json.errors.map(error => error.message).join('; '))
		if (json?.data == null) throw new Error('Twitch returned no data.')
		return json.data
	}

	if (authenticated) {
		if (!Array.isArray(json) || json.length !== 2) throw new Error('Twitch returned no authentication verification.')
		if (!readData(json[1]).currentUser?.id) throw new Error('Twitch did not authenticate this check. Sign in again.')
		return readData(json[0])
	}
	return readData(json)
}
