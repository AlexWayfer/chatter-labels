import { createTwitchClient } from './twitch-client.js'
import { requestTwitch } from './twitch-request.js'
import { requireUserScripts } from './user-scripts.js'
import { checkChannel } from './check-context.js'
import { createBestLogsClient } from './bestlogs-client.js'
import { normalizeCheckResult } from './check-result.js'

export class LabelCheckRunner {
	#storage
	#request
	#runs = new Map()

	constructor(storage, { request = requestTwitch } = {}) {
		this.#storage = storage
		this.#request = request
	}

	#assertSender(sender) {
		let url

		try {
			url = new URL(sender?.url)
		} catch {
			throw new Error('Unsupported check source.')
		}

		if (sender.id !== chrome.runtime.id || !sender.tab?.id || sender.frameId !== 0 ||
			url.protocol !== 'https:' ||
			!(url.hostname === 'lurkology.com' || (/(^|\.)twitch\.tv$/).test(url.hostname))) {
			throw new Error('Unsupported check source.')
		}
	}

	async requestTwitch(message, sender) {
		this.#assertSender(sender)
		const run = this.#runs.get(message.runId)

		if (!run) throw new Error('This label check is no longer running.')
		if (sender.tab.id !== run.sender.tab.id ||
			run.sender.documentId && sender.documentId !== run.sender.documentId ||
			!!sender.tab.incognito !== !!run.sender.tab.incognito) {
			throw new Error('Unsupported check source.')
		}
		run.controller.signal.throwIfAborted()
		return this.#request({
			query: message.query, variables: message.variables, authenticated: message.authenticated === true
		}, { signal: run.controller.signal, tabId: sender.tab.id })
	}

	async run({ labelId, user, source, pageUrl }, sender) {
		this.#assertSender(sender)
		if (!user || typeof user.id !== 'string' || !user.id) throw new Error('Missing Twitch user ID.')
		const labels = await this.#storage.get('labels')
		const label = labels.find(label => label.id === labelId)

		if (!label?.script?.trim()) throw new Error('This label has no check script. Save it in Options first.')
		await requireUserScripts()
		const target = { tabId: sender.tab.id }

		if (sender.documentId) target.documentIds = [sender.documentId]
		else target.frameIds = [sender.frameId]
		const input = { id: user.id, login: user.login, username: user.username }
		const channel = checkChannel(source, pageUrl ?? sender.url, sender.url)
		const runId = crypto.randomUUID()
		const controller = new AbortController()

		this.#runs.set(runId, { sender, controller })
		const code = `(async (user, channel, signal) => {
			try {
				const twitch = (${createTwitchClient.toString()})(signal, ${JSON.stringify(runId)});
				const bestLogs = (${createBestLogsClient.toString()})(user, channel, twitch, signal);
				const value = await (async () => {
${label.script}
				})();
				return { ok: true, value: (${normalizeCheckResult.toString()})(value) };
			} catch (error) {
				return { ok: false, error: String(error?.message ?? error) };
			}
		})(${JSON.stringify(input)}, ${JSON.stringify(channel)}, AbortSignal.timeout(60000))`
		let timer

		try {
			await chrome.userScripts.configureWorld({ worldId: 'label-checks', messaging: true })
			const results = await Promise.race([
				chrome.userScripts.execute({ target, world: 'USER_SCRIPT', worldId: 'label-checks', js: [{ code }] }),
				new Promise((_, reject) => {
					timer = setTimeout(() => reject(new Error('Check timed out after 65 seconds.')), 65000)
				})
			])
			const result = results[0]

			if (result?.error) throw new Error(result.error.message ?? String(result.error))
			if (!result?.result) throw new Error('The check returned no result. Check its JavaScript syntax.')
			if (!result.result.ok) throw new Error(result.result.error)
			return result.result.value
		} catch (error) {
			await requireUserScripts()
			throw error
		} finally {
			controller.abort(new Error('The label check has finished.'))
			this.#runs.delete(runId)
			clearTimeout(timer)
		}
	}
}
