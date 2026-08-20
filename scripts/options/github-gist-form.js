import { logger } from '../logger.js'
import { GitHubGist } from '../storage/providers/github-gist.js'
import { Toast } from './toast.js'

export class GitHubGistForm {
	#storage
	#optionsStorage
	#tokenInputElement
	#submitButtonElement
	#toastSaved
	#toastError

	static async create(element, optionsStorage) {
		const storage = await optionsStorage.get('storage')

		new this(element, storage, optionsStorage)
	}

	constructor(element, storage, optionsStorage) {
		this.#storage = storage
		this.#optionsStorage = optionsStorage
		this.#tokenInputElement = element.querySelector('input[name="token"]')
		this.#submitButtonElement = element.querySelector('button[type="submit"]')
		this.#toastSaved = new Toast(element.querySelector('.toast.saved'))
		this.#toastError = new Toast(element.querySelector('.toast.error'))

		this.#setTokenInputElementValue(this.#storage.githubGist?.token)

		const tokenVisibilityToggleElement = element.querySelector('button.token-visibility-toggle')

		tokenVisibilityToggleElement.addEventListener('click', _event => {
			this.#tokenInputElement.type =
				this.#tokenInputElement.type == 'password' ? 'text' : 'password'
		})

		element.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		optionsStorage.subscribe('storage', storage => {
			logger.debug('GitHub Gist Form storage message received')

			this.#setTokenInputElementValue(storage.githubGist?.token)
		})
	}

	async #save() {
		this.#submitButtonElement.disabled = true

		try {
			const token = this.#tokenInputElement.value
			const provider = new GitHubGist(token, this.#storage.githubGist?.gistId)
			const gistId = await provider.ensureGistAccess()

			this.#storage.githubGist = { token, gistId }

			await this.#optionsStorage.set('storage', this.#storage)

			this.#toastSaved.show()
		} catch (error) {
			logger.debug('GitHub Gist Form submit failed', error)

			this.#toastError.show(error)
		} finally {
			this.#submitButtonElement.disabled = false
		}
	}

	#setTokenInputElementValue(newValue) {
		this.#tokenInputElement.value = newValue ?? ''
	}
}
