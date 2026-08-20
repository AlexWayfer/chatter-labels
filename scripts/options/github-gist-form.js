import { logger } from '../logger.js'
import { GitHubGist } from '../storage/providers/github-gist.js'
import { Form } from './form.js'
import { Toast } from './toast.js'

export class GitHubGistForm extends Form {
	#storage
	#optionsStorage
	#tokenInputElement
	#existingGistElement
	#toastError

	static async create(element, optionsStorage) {
		const storage = await optionsStorage.get('storage')

		new this(element, storage, optionsStorage)
	}

	constructor(element, storage, optionsStorage) {
		super(element)

		this.#storage = storage
		this.#optionsStorage = optionsStorage
		this.#tokenInputElement = this.element.querySelector('input[name="token"]')
		this.#existingGistElement = this.element.querySelector('.existing-gist')
		this.#toastError = new Toast(this.element.querySelector('.toast.error'))

		this._setTokenInputElementValue(this.#storage.githubGist?.token)
		this._setExistingGistElementHref(this.#storage.githubGist?.gistId)

		const tokenVisibilityToggleElement =
			this.element.querySelector('button.token-visibility-toggle')

		tokenVisibilityToggleElement.addEventListener('click', _event => {
			this.#tokenInputElement.type =
				this.#tokenInputElement.type == 'password' ? 'text' : 'password'
		})

		this.element.addEventListener('submit', event => {
			event.preventDefault()

			this._save()
		})

		optionsStorage.subscribe('storage', storage => {
			logger.debug('GitHub Gist Form storage message received')

			this._setTokenInputElementValue(storage.githubGist?.token)
			this._setExistingGistElementHref(storage.githubGist?.gistId)
		})
	}

	async _save() {
		super._save(async () => {
			try {
				const token = this.#tokenInputElement.value
				const provider = new GitHubGist(token, this.#storage.githubGist?.gistId)
				const gistId = await provider.ensureGistAccess()

				this.#storage.githubGist = { token, gistId }

				await this.#optionsStorage.set('storage', this.#storage)
			} catch (error) {
				this.#toastError.show(error)

				throw error
			}
		})
	}

	_setTokenInputElementValue(newValue) {
		this.#tokenInputElement.value = newValue ?? ''
	}

	_setExistingGistElementHref(gistId) {
		if (!gistId) {
			this.#existingGistElement.classList.add('hidden')
			return
		}

		this.#existingGistElement.classList.remove('hidden')
		this.#existingGistElement.querySelector('a').href = `https://gist.github.com/${gistId}`
	}
}
