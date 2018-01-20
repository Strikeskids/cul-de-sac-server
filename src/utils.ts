
export function parseIP (ip : string) : string {
	if (ip.substr(0, 7) === "::ffff:") {
		return ip.substr(7);
	}
	return ip;
}