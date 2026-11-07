import { blockedCheckScript } from './blocked-example.js'
import { logKeywordsScript } from './log-keywords-example.js'

export const scriptExamples = [
	{
		id: 'blocked-me',
		title: 'Blocked me',
		description: 'Checks whether this channel owner blocked your current Twitch account. Other viewing restrictions are reported as errors.',
		script: blockedCheckScript
	},
	{
		id: 'log-keywords',
		title: 'Keyword matches in chat logs',
		description: 'Fill the empty array with words or * masks. Searches this chatter’s available archive in the current Twitch channel using BestLogs q queries, then matches whole words locally, ignoring case. Reads result pages until exhausted, with pauses between requests. Requires your Twitch sign-in. Run from a chatter card in Twitch chat.',
		script: logKeywordsScript
	}
]

export const scriptFunctions = [
	{
		id: 'twitch-gql',
		title: 'twitch.gql()',
		description: 'twitch.gql(query, variables, options) returns response data, using your Twitch session and the check deadline. HTTP and GraphQL errors are reported automatically. authenticated: true verifies that Twitch recognizes your sign-in. Works from Twitch and Lurkology without an open Twitch tab.',
		script: `const { currentUser } = await twitch.gql(
	'{ currentUser { id } }', {}, { authenticated: true }
);
return currentUser.id;
`
	},
	{
		id: 'twitch-user',
		title: 'twitch.getUser()',
		description: 'twitch.getUser(id, fields) returns the selected fields for a Twitch user ID, including suspended accounts. It reports an error when the user is not found. Supply a GraphQL field selection such as login or id login displayName.',
		script: `const { login } = await twitch.getUser(user.id, 'login');
return login;
`
	},
	{
		id: 'bestlogs-search',
		title: 'bestLogs.searchMessages()',
		description: 'Uses the same paginated archive queries and options as countMessages, but returns { count, checked, messages }. checked counts unique candidates returned by the keyword queries, including whole-word mismatches and custom-filter rejections; it is not the chatter’s total message count. Return text and messages to show accepted matches out of inspected candidates and a collapsible message list. Timestamps link to full channel chat on Lurkology in a new tab. Opening the list makes no new requests.',
		script: `const keywords = [];
const { count, checked, messages } = await bestLogs.searchMessages(keywords);
return { text: count + ' of ' + checked + ' candidates', messages };
`
	},
	{
		id: 'bestlogs-count',
		title: 'bestLogs.countMessages()',
		description: 'Searches this chatter’s available archive in the current Twitch chat channel using q, then validates whole words and * masks locally, ignoring case. Returns a number; use searchMessages for candidates checked and message details. Queries are deduplicated and paginated in batches of up to 500, with 400 ms pauses between requests. Optional filter(message, matchedWords) accepts or rejects each matching message once. By default there is no candidate or match cap; optional maxMessages caps unique candidates checked, and limit caps accepted matches. A 429 allows one short retry for the entire search. Archive coverage and the check deadline still apply.',
		script: `const keywords = [];
return await bestLogs.countMessages(keywords);
`
	}
]
