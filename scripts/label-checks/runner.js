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

	#sameDocument(sender, origin) {
		return sender.tab.id === origin.tab.id &&
			(!origin.documentId || sender.documentId === origin.documentId) &&
			!!sender.tab.incognito === !!origin.tab.incognito
	}

	#activeRun(runId, sender) {
		this.#assertSender(sender)
		const run = this.#runs.get(runId)

		if (!run) throw new Error('This label check is no longer running.')
		if (!this.#sameDocument(sender, run.sender)) throw new Error('Unsupported check source.')
		run.controller.signal.throwIfAborted()
		return run
	}

	connect(port) {
		try {
			const run = this.#activeRun(port.name, port.sender)

			if (run.port) throw new Error('This check is already connected.')
			run.port = port
			port.onDisconnect.addListener(() => {
				run.port = null
				run.controller.abort(new Error('The label check connection closed.'))
			})
			port.postMessage({ ready: true })
		} catch {
			port.disconnect()
		}
	}

	cancel({ requestId }, sender) {
		this.#assertSender(sender)
		if (typeof requestId !== 'string' || !requestId) return
		const run = [...this.#runs.values()].find(run => {
			return run.requestId === requestId && this.#sameDocument(sender, run.sender)
		})

		if (!run) return
		const partial = run.progress
			? { text: `${run.progress.count} of ${run.progress.checked} candidates`, messages: run.progress.messages }
			: { text: 'Stopped.', messages: [] }

		run.controller.abort(Object.assign(new Error('Check stopped.'), { code: 'label-check-cancelled', partial }))
	}

	async requestTwitch(message, sender) {
		const run = this.#activeRun(message.runId, sender)

		return this.#request({
			query: message.query, variables: message.variables, authenticated: message.authenticated === true
		}, { signal: run.controller.signal, tabId: sender.tab.id })
	}

	async reportProgress({ runId, sequence, request, total, checked, count, messages }, sender) {
		const run = this.#activeRun(runId, sender)
		const { sender: origin, requestId } = run

		if (typeof requestId !== 'string' ||
			[sequence, request, total].some(value => !Number.isSafeInteger(value) || value < 1) ||
			[checked, count].some(value => !Number.isSafeInteger(value) || value < 0) ||
			request > total || count > checked || sequence <= (run.progress?.sequence ?? 0)) return
		const snapshot = messages === undefined
			? count === 0 ? [] : run.progress?.messages ?? []
			: normalizeCheckResult({ text: '', messages }).messages

		if (snapshot.length !== count) return
		run.progress = { sequence, checked, count, messages: snapshot }
		const target = origin.documentId ? { documentId: origin.documentId } : { frameId: origin.frameId }

		await chrome.tabs.sendMessage(origin.tab.id, {
			type: 'label-check-progress', requestId, sequence, request, total, checked, count
		}, target)
	}

	async run(message, sender) {
		this.#assertSender(sender)
		const runId = crypto.randomUUID()
		const controller = new AbortController()
		const { signal } = controller
		const run = { sender, controller, requestId: message.requestId }

		this.#runs.set(runId, run)
		const stopped = new Promise((_, reject) => {
			signal.addEventListener('abort', () => reject(signal.reason), { once: true })
		})
		const timer = setTimeout(() => controller.abort(new Error('Check timed out after 65 seconds.')), 65000)

		try {
			return await Promise.race([this.#execute(message, sender, runId, signal), stopped])
		} finally {
			clearTimeout(timer)
			this.#runs.delete(runId)
			controller.abort(new Error('The label check has finished.'))
			run.port?.disconnect()
		}
	}

	async #execute({ labelId, user, source, pageUrl }, sender, runId, runSignal) {
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
		const code = `(async (user, channel, runId) => {
			try {
				const controller = new AbortController();
				const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
				const port = chrome.runtime.connect({ name: runId });
				port.onDisconnect.addListener(() => controller.abort(new Error('The label check has ended.')));
				await new Promise((resolve, reject) => {
					const onAbort = () => reject(signal.reason);
					signal.addEventListener('abort', onAbort, { once: true });
					port.onMessage.addListener(() => {
						signal.removeEventListener('abort', onAbort);
						resolve();
					});
				});
				signal.throwIfAborted();
				const twitch = (${createTwitchClient.toString()})(signal, runId);
				const bestLogs = (${createBestLogsClient.toString()})(user, channel, twitch, signal, progress => {
					return chrome.runtime.sendMessage({ type: 'label-check-progress', runId, ...progress }).catch(() => {});
				});
				const value = await (async () => {
${label.script}
				})();
				return { ok: true, value: (${normalizeCheckResult.toString()})(value) };
			} catch (error) {
				return { ok: false, error: String(error?.message ?? error) };
			}
		})(${JSON.stringify(input)}, ${JSON.stringify(channel)}, ${JSON.stringify(runId)})`

		try {
			runSignal.throwIfAborted()
			await chrome.userScripts.configureWorld({ worldId: 'label-checks', messaging: true })
			runSignal.throwIfAborted()
			const results = await chrome.userScripts.execute({ target, world: 'USER_SCRIPT', worldId: 'label-checks', js: [{ code }] })
			const result = results[0]

			if (result?.error) throw new Error(result.error.message ?? String(result.error))
			if (!result?.result) throw new Error('The check returned no result. Check its JavaScript syntax.')
			if (!result.result.ok) throw new Error(result.result.error)
			return result.result.value
		} catch (error) {
			runSignal.throwIfAborted()
			await requireUserScripts()
			throw error
		}
	}
}
