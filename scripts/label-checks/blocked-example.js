// Twitch's web player maps UNAUTHORIZED to "blocked". This is an undocumented API.
export const blockedCheckScript = `const login = user.login || (await twitch.getUser(user.id, 'login')).login;
if (!login) throw new Error('Twitch returned no login for this user.');
const data = await twitch.gql(\`
	query($login: String!) {
		currentUser { id }
		streamPlaybackAccessToken(channelName: $login, params: {
			platform: "web", playerBackend: "mediaplayer", playerType: "site"
		}) { value authorization { isForbidden forbiddenReasonCode } }
	}
\`, { login }, { authenticated: true });
const access = data.streamPlaybackAccessToken;
const authorization = access?.authorization;
if (authorization?.isForbidden === true && authorization.forbiddenReasonCode === 'UNAUTHORIZED') return true;
if (authorization?.isForbidden === false) {
	if (!access.value) throw new Error('Twitch returned no playback information.');
	const issued = JSON.parse(access.value);
	if (String(issued.user_id) !== data.currentUser.id) throw new Error('Twitch did not authenticate playback.');
	if (String(issued.channel_id) !== user.id) throw new Error('Twitch returned a different channel.');
	return false;
}
throw new Error('Viewing is restricted for another or unknown reason: ' + (authorization?.forbiddenReasonCode ?? 'unknown'));
`
