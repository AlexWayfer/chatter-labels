(() => {
	if (window.chatterLabelsLurkology) return
	window.chatterLabelsLurkology = true

	let users = new Map()
	const originalFetch = window.fetch

	window.fetch = async function (...args) {
		const response = await originalFetch.apply(this, args)
		const url = new URL(args[0]?.url ?? args[0], location.href)

		if (url.origin !== 'https://bestlogs.lurkology.com' || url.searchParams.get('jsonBasic') !== '1') {
			return response
		}

		const originalJSON = response.json

		response.json = async function (...jsonArgs) {
			const data = await originalJSON.apply(this, jsonArgs)

			if (Array.isArray(data?.messages)) {
				users = new Map(data.messages.flatMap(message => {
					const id = message.tags?.['target-user-id'] || message.tags?.['user-id']

					return message.id && id
						? [[message.id, {
							id: String(id), username: (message.displayName || '').replace(/^:/, '')
						}]]
						: []
				}))
				document.dispatchEvent(new Event('chatter-labels:lurkology-users'))
			}
			return data
		}
		return response
	}

	document.addEventListener('chatter-labels:resolve-lurkology-user', event => {
		const element = event.target

		if (!(element instanceof Element)) return
		const permalink = element.querySelector('a[title="Permalink"]')
		const user = permalink && users.get(new URL(permalink.href).hash.slice(1))

		delete element.dataset.userId
		delete element.dataset.username
		if (!user) return
		element.dataset.userId = user.id
		element.dataset.username = user.username
	})
})()
