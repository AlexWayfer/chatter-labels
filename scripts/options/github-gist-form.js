import { logger } from '../logger.js'
import { GitHubGist } from '../storage/providers/github-gist.js'
import { Form } from './form.js'

export class GitHubGistForm extends Form {
	#storage
	#optionsStorage
	#tokenInputElement
	#existingGistElement

	static async create(element, optionsStorage) {
		const storage = await optionsStorage.get('storage')

		new this(element, storage, optionsStorage)
	}

	constructor(element, storage, optionsStorage) {
		super(element)

		this.#storage = storage
		this.#optionsStorage = optionsStorage
		this.#tokenInputElement = this._element.querySelector('input[name="token"]')
		this.#existingGistElement = this._element.querySelector('.existing-gist')

		this._setTokenInputElementValue(this.#storage.githubGist?.token)
		this._setExistingGistElementHref(this.#storage.githubGist?.gistId)

		const tokenVisibilityToggleElement =
			this._element.querySelector('button.token-visibility-toggle')

		tokenVisibilityToggleElement.addEventListener('click', _event => {
			this.#tokenInputElement.type =
				this.#tokenInputElement.type == 'password' ? 'text' : 'password'
		})

		this._element.addEventListener('submit', event => {
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
			const token = this.#tokenInputElement.value
			const provider = new GitHubGist(token, this.#storage.githubGist?.gistId)
			const gistId = await provider.ensureGistAccess()

			this.#storage.githubGist = { token, gistId }

			await this.#optionsStorage.set('storage', this.#storage)
		})
	}

	_setTokenInputElementValue(newValue) {
		this.#tokenInputElement.value = newValue ?? ''
	}

	_setExistingGistElementHref(gistId) {
		if (!gistId) {
			this.#existingGistElement.hidden = true
			return
		}

		this.#existingGistElement.hidden = false
		this.#existingGistElement.querySelector('a').href = `https://gist.github.com/${gistId}`
	}
}
