// Keep this factory self-contained: the runner injects it into the user-script world.
export function createBestLogsClient(user, channel, twitch, signal) {
	function pause(milliseconds) {
		signal.throwIfAborted()
		return new Promise((resolve, reject) => {
			const onAbort = () => {
				clearTimeout(timer)
				signal.removeEventListener('abort', onAbort)
				reject(signal.reason)
			}
			const timer = setTimeout(() => {
				signal.removeEventListener('abort', onAbort)
				resolve()
			}, milliseconds)

			signal.addEventListener('abort', onAbort, { once: true })
			if (signal.aborted) onAbort()
		})
	}

	const client = {
		async countMessages(keywords, options = {}) {
			return (await client.searchMessages(keywords, options)).count
		},
		async searchMessages(keywords, options = {}) {
			signal.throwIfAborted()
			if (!channel) {
				throw new Error('Open this check from a chatter card in a Twitch channel chat. Profile pages and Lurkology do not provide this context.')
			}
			if (!Array.isArray(keywords) || keywords.some(word => typeof word !== 'string')) {
				throw new Error('Provide keywords as an array of strings.')
			}
			if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['filter', 'limit', 'maxMessages'].includes(key))) {
				throw new Error('Unknown BestLogs search option. Supported options are filter, limit, and maxMessages.')
			}
			const { filter, limit = Infinity, maxMessages = Infinity } = options

			if (filter !== undefined && typeof filter !== 'function') throw new Error('The message filter must be a function.')
			if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('The match limit must be a positive integer.')
			if (maxMessages !== Infinity && (!Number.isSafeInteger(maxMessages) || maxMessages < 1)) {
				throw new Error('The candidate limit must be a positive integer.')
			}
			const terms = new Set(keywords.map(word => word.trim().toLowerCase()).filter(Boolean))

			if (!terms.size) throw new Error('Add at least one non-empty keyword.')
			const patterns = []
			const queries = new Set()

			for (const term of terms) {
				if (!(/^[\p{L}\p{M}\p{N}_*]+$/u).test(term)) {
					throw new Error('Each keyword must be a single word, optionally containing * wildcards.')
				}
				const parts = term.normalize('NFC').split('*')
				if (!parts.some(Boolean)) throw new Error('Each keyword must contain at least one character other than *.')

				patterns.push(new RegExp('^' + parts.join('.*') + '$', 'u'))
				queries.add(parts.reduce((longest, part) => {
					return part.length > longest.length ? part : longest
				}, ''))
			}
			const { user: owner } = await twitch.gql(
				'query($login: String!) { user(login: $login, lookupType: ALL) { id } }',
				{ login: channel.login }
			)

			if (!owner) throw new Error('Twitch channel not found.')
			const matches = []
			const inspected = new Set()
			const result = () => ({ count: matches.length, checked: inspected.size, messages: matches })
			let retried = false
			const search = async url => {
				for (;;) {
					signal.throwIfAborted()
					const response = await fetch(url, { signal, credentials: 'omit' })

					if (response.status !== 429) return response
					await response.body?.cancel()
					const retryAfter = response.headers.get('Retry-After')
					let milliseconds = NaN

					if (retryAfter?.trim()) {
						const seconds = Number(retryAfter)

						milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
					}
					const delay = Number.isFinite(milliseconds) ? Math.max(500, milliseconds) : 1000

					if (retried || delay > 3000) {
						const seconds = Math.ceil(delay / 1000)
						const advice = Number.isFinite(milliseconds)
							? `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
							: 'Wait before trying again.'

						throw new Error(`BestLogs rate limit reached (HTTP 429). ${advice}`)
					}
					retried = true
					await pause(delay)
				}
			}

			let requested = false

			for (const query of queries) {
				let offset = 0
				let previousPage = null

				for (;;) {
					signal.throwIfAborted()
					if (inspected.size >= maxMessages) return result()
					if (requested) await pause(400)
					requested = true
					const pageSize = Math.min(500, maxMessages - inspected.size)
					const url = new URL('https://bestlogs.lurkology.com/channelid/' + owner.id + '/userid/' + user.id + '/search')

					url.search = new URLSearchParams({ q: query, jsonBasic: '1', reverse: '1', limit: String(pageSize), offset: String(offset) })
					const response = await search(url)

					signal.throwIfAborted()
					if (response.status === 404) {
						if ((await response.text()).trim() === 'Not found') break
						throw new Error('No archived logs are available for this user in this channel.')
					}
					if (!response.ok) throw new Error('BestLogs search failed: HTTP ' + response.status)
					const data = await response.json()

					signal.throwIfAborted()
					if (!Array.isArray(data?.messages)) throw new Error('BestLogs returned an invalid search response.')
					const batch = data.messages.slice(0, pageSize)
					const fingerprint = JSON.stringify(batch.map(message => [message?.id, message?.timestamp]))

					if (batch.length && fingerprint === previousPage) throw new Error('BestLogs pagination did not advance. Try again later.')
					previousPage = fingerprint
					for (const message of batch) {
						// jsonBasic also contains generated CLEARCHAT/CLEARMSG records, often without a message ID.
						if (message?.tags?.['target-user-id'] || message?.tags?.['target-msg-id']) continue
						if (!message || !message.id || typeof message.text !== 'string' || !message.tags?.['user-id'] || !message.tags?.['room-id']) {
							throw new Error('BestLogs returned an invalid search response.')
						}
						if (String(message.tags['user-id']) !== user.id || String(message.tags['room-id']) !== owner.id) continue
						if (inspected.has(message.id)) continue
						inspected.add(message.id)
						const words = message.text.toLowerCase()
							.normalize('NFC')
							.match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []
						const matchedWords = [...new Set(words.filter(word => patterns.some(pattern => pattern.test(word))))]

						if (!matchedWords.length) continue
						if (filter) {
							const accepted = await filter(message, matchedWords)

							signal.throwIfAborted()
							if (typeof accepted !== 'boolean') throw new Error('The message filter must return a boolean.')
							if (!accepted) continue
						}
						matches.push({ ...message, channelId: owner.id })
						if (matches.length >= limit) return result()
					}
					if (batch.length < pageSize) break
					offset += batch.length
				}
			}
			return result()
		}
	}

	return Object.freeze(client)
}
