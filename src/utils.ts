export type seconds = number;

export function parseIP (ip : string) : string {
	if (ip.substr(0, 7) === "::ffff:") {
		return ip.substr(7);
	}
	return ip;
}

export function generateSineWave (sampleRate : number, freq : number, duration : seconds) : Array<number> {
	const samples = (duration * sampleRate) |0;
	const cycleWidth = sampleRate / freq;

	const result = new Array(samples);
	for (let i = 0; i < samples; ++i) {
		result[i] = Math.sin(i / cycleWidth * 2 * Math.PI);
	}

	return result;
}

export class Deferred<T> {
	resolve : (result : T) => void;
	promise : Promise<T>;

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
		});
	}
}
