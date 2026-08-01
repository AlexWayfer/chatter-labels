import { logger } from '../logger.js'

export class GitHubGistForm {
	#storage
	#tokenInputElement

	static async create(element, optionsStorage) {
		const storage = await optionsStorage.get('storage')

		new this(element, storage, optionsStorage)
	}

	constructor(element, storage, optionsStorage) {
		this.#storage = storage
		this.#tokenInputElement = element.querySelector('input[name="token"]')

		this.#setTokenInputElementValue(this.#storage.githubGist?.token)

		element.addEventListener('submit', event => {
			event.preventDefault()

			this.#storage.githubGist = { token: this.#tokenInputElement.value }

			optionsStorage.set('storage', this.#storage)
		})

		optionsStorage.subscribe('storage', storage => {
			logger.debug('GitHub Gist Form storage message received')

			this.#setTokenInputElementValue(storage.githubGist?.token)
		})
	}

	#setTokenInputElementValue(newValue) {
		this.#tokenInputElement.value = newValue ?? ''
	}
}
