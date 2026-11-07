// Keep this factory self-contained: the runner injects it into the user-script world.
export function createTwitchClient(signal, runId) {
	const client = {
		async gql(query, variables = {}, { authenticated = false } = {}) {
			signal.throwIfAborted()
			let onAbort

			try {
				const response = await Promise.race([
					chrome.runtime.sendMessage({ type: 'label-check-twitch-gql', runId, query, variables, authenticated }),
					new Promise((_, reject) => {
						onAbort = () => reject(signal.reason)
						signal.addEventListener('abort', onAbort, { once: true })
						if (signal.aborted) onAbort()
					})
				])

				if (!response?.ok) throw new Error(response?.error ?? 'Could not reach the extension. Reload this page and try again.')
				return response.data
			} finally {
				if (onAbort) signal.removeEventListener('abort', onAbort)
			}
		},
		async getUser(id, fields) {
			if (typeof id !== 'string' || !id.trim()) throw new Error('A Twitch user ID is required.')
			if (typeof fields !== 'string' || !fields.trim()) throw new Error('User fields are required.')
			const data = await client.gql(`query($id: ID!) {
				user(id: $id, lookupType: ALL) { ${fields} }
			}`, { id })

			if (!data?.user) throw new Error('Twitch user not found.')
			return data.user
		}
	}

	return Object.freeze(client)
}
