import { Readable } from 'stream';

const queueize = 8192;
const zeroBuffer = Buffer.alloc(queueize);
const sampleRate = 48000;

export type Source =
	| { kind: 'buffer', data: Buffer }
	| { kind: 'stream', data: NodeJS.ReadableStream }
	| { kind: 'silence', data: number }

class Deferred<T> {
	resolve : (result : T) => void;
	promise : Promise<T>;

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
		});
	}
}

type Queue =
	| Source
	| { kind: 'hold', data: Promise<Array<Source>> }
	| { kind: 'time', data: Deferred<number> }
	| { kind: 'stream_wait', data: NodeJS.ReadableStream }
	| { kind: 'hold_wait' }

export interface SyncPoint {
	source: Source;
	time: number;
	stager: AudioStager;
}

export interface Hold {
	time : Promise<number>;
	cb : (sources : Array<Source>) => any;
}

export class AudioStager extends Readable {
	private queue : Array<Queue>;
	currentHead : number;
	paused : boolean;
	timer : NodeJS.Timer;

	constructor() {
		super();

		this.queue = [];
		this.currentHead = 0;
		this.paused = false;
	}

	currentTime() : Promise<number> {
		if (this.queue.length === 0) {
			return Promise.resolve(this.currentHead);
		}

		const last = this.queue.slice(-1)[0];
		if (last.kind === 'time') return last.data.promise;

		const deferred = new Deferred<number>();
		this.queue.push({kind: 'time', data: deferred});

		return deferred.promise;
	}

	hold() : Hold {
		let start = this.currentTime();
		let deferred = new Deferred<Array<Source>>();

		this.queue.push({
			kind: 'hold',
			data: deferred.promise,
		});

		return {
			time: start,
			cb : deferred.resolve,
		};
	}

	appendBuffer(data : Buffer) : Promise<number> {
		let start = this.currentTime();

		this.queue.push({kind: 'buffer', data: data});

		return start;
	}

	appendSamples(data : Array<number>) : Promise<number> {
		const buf = new Buffer(data.length * 2);
		data.forEach((el, i) => {
			buf.writeInt16LE(el, i*2);
		});

		return this.appendBuffer(buf);
	}

	private _pushBuffer(buf : Buffer) : boolean {
		this.currentHead += buf.length;
		this.paused = false;
		return this.push(buf);
	}

	private _unpause() : void {
		if (this.paused) {
			this.paused = false;
			process.nextTick(() => this._read(1));
		}
	}

	private _handleSource() : boolean {
		const src = this.queue.shift();

		if (src === undefined) return true;

		switch (src.kind) {
			case 'buffer':
				return this._pushBuffer(src.data);

			case 'stream':
				const wait : Queue = { kind: 'stream_wait', data: src.data };
				this.queue.unshift(wait);

				src.data.on('data', (chunk) => {
					if (!this._pushBuffer(chunk)) {
						src.data.pause();
					}
				});
				src.data.on('end', () => {
					this.queue.shift();
					this._unpause();
				});
				return this.queue.length === 0 || this.queue[0] !== wait;

			case 'stream_wait':
				this.queue.unshift(src);
				src.data.resume();

				return false;

			case 'hold':
				const hold_wait : Queue = { kind: 'hold_wait' };
				this.queue.unshift(hold_wait);

				src.data.then((sources) => {
					this.queue.shift();
					this.queue.unshift(...sources);
					this._unpause();
				});
				return this.queue.length === 0 && this.queue[0] !== hold_wait;

			case 'hold_wait':
				this.queue.unshift(src);
				return false;

			case 'time':
				src.data.resolve(this.currentHead);
				return true;

			case 'silence':
				for (let left = src.data; left > 0; left -= zeroBuffer.length) {
					if (this._pushBuffer(zeroBuffer.slice(left))) {
						left -= zeroBuffer.length;
						if (left > 0) this.queue.unshift({ kind: 'silence', data: left });
						return false;
					}
				}
				return true;
		}
	}

	_read(size : number) {
		this.paused = true;

		while (this.queue.length > 0) {
			clearTimeout(this.timer);

			if (!this._handleSource()) return;
		}

		if (this.paused) {
			this.timer = setTimeout(() => {
				// There should be nothing in the queue AND we are paused
				this._pushBuffer(zeroBuffer);
			}, zeroBuffer.length / sampleRate / 2 * 1000);
		}
	}
}

export function sync(points : Array<SyncPoint>) {
	const holds = points.map(({ stager }) => stager.hold());
	Promise.all(holds.map(({time}) => time))
		.then((times) => {
			const offsets = points.map(({ time }, index) => time - times[index]);
			const minOffset = Math.min(...offsets);

			points.forEach(({ stager, source }, index) => {
				holds[index].cb([
					{ kind: 'silence', data: offsets[index] - minOffset },
					source,
				]);
			});
		});
}
