import { logger } from '../logger.js'
import { BaseStorage } from './base.js'
import { GitHubGist } from './providers/github-gist.js'
import { Label } from '../models/label.js'
import { Assignment } from '../models/assignment.js'

export class MainStorage extends BaseStorage {
	static PORT_NAME = 'main-storage'

	_parsers = {
		labels: rawLabels => {
			return rawLabels.map(data => new Label(data))
		},
		assignments: rawAssignments => {
			return rawAssignments.map(({ labelId, ...data }) => {
				return new Assignment({
					...data,
					label: this._data.labels.find(label => label.id == labelId)
				})
			})
		}
	}

	static async create(optionsStorage) {
		const
			storageConfig = await optionsStorage.get('storage'),
			githubGist = storageConfig.githubGist

		// logger.debug('githubGist = ', githubGist)

		const provider = new GitHubGist(githubGist?.token, githubGist?.gistId)

		optionsStorage.subscribe('storage', updatedConfig => {
			const githubGist = updatedConfig.githubGist

			provider.token = githubGist?.token
			provider.gistId = githubGist?.gistId
		})

		return super.create(provider)
	}

	constructor(provider) {
		super()
		this._provider = provider
	}

	async _load() {
		const rawData = await this._provider.get(['labels', 'assignments'])

		this._data.labels = this._parsers.labels(rawData.labels ?? []),
		this._data.assignments = this._parsers.assignments(rawData.assignments ?? [])

		this._loaded = true

		logger.debug('Main Storage data loaded.')
	}
}
