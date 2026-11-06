export class GitHubGist {
	static API_BASE = 'https://api.github.com/gists'
	static API_VERSION = '2026-03-10'
	static GIST_DESCRIPTION = 'Chatter Labels — synced data'

	constructor(token, gistId = null) {
		this.token = token
		this.gistId = gistId
	}

	async get(keys) {
		if (!this.gistId) {
			return {}
		}

		const gist = await this.#fetchGist()
		const result = {}

		for (const key of keys) {
			const file = gist.files[this.#buildFileName(key)]
			if (!file) continue

			// Gist API truncates files larger than ~1MB and they have `truncated: true`,
			// in this case we have to get complete content by `raw_url`
			const content =
				file.truncated
					? await (await fetch(file.raw_url, { cache: 'no-store' })).text()
					: file.content

			result[key] = JSON.parse(content)
		}

		return result
	}

	async set(key, serializedValue) {
		const fileName = this.#buildFileName(key)
		const content = JSON.stringify(serializedValue, null, '\t')

		await this.#patchGist(fileName, content)
	}

	// Validate the selected gist, or create one when no ID is provided.
	async ensureGistAccess() {
		if (this.gistId) {
			await this.#fetchGist()
			return this.gistId
		}

		return this.#createGist()
	}

	async #createGist() {
		const response = await this.#request('POST', '', {
			public: false,
			description: this.constructor.GIST_DESCRIPTION,
			files: {
				'README.md': {
					content: [
						`# ${this.constructor.GIST_DESCRIPTION}`,
						'',
						'Managed automatically by the extension.'
					].join('\n')
				}
			}
		})

		const gist = await response.json()
		this.gistId = gist.id

		return this.gistId
	}

	async #fetchGist() {
		const response = await this.#request('GET', `/${this.gistId}`)

		return response.json()
	}

	async #patchGist(fileName, content) {
		await this.#request('PATCH', `/${this.gistId}`, {
			files: {
				[fileName]: { content }
			}
		})
	}

	async #request(method, path, body = undefined) {
		const response = await fetch(`${this.constructor.API_BASE}${path}`, {
			method: method,
			cache: 'no-store',
			headers: {
				'Authorization': `Bearer ${this.token}`,
				'X-GitHub-Api-Version': this.constructor.API_VERSION,
				'Accept': 'application/vnd.github+json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		})

		if (!response.ok) {
			if (response.status == 401) throw new Error('Incorrect GitHub token.')

			throw new Error(`Failed to ${method} ${path}: ${response.status} ${response.statusText}`)
		}

		return response
	}

	#buildFileName(key) {
		return `${key}.json`
	}
}
