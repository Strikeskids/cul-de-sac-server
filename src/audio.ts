import { Readable } from 'stream';
import { Deferred, seconds } from './utils';

const zeroBuffer = Buffer.alloc(8192);
const bytesPerSample = 2;
const maxSample = (1 << 15) - 1;

export type Source =
	| { kind: 'buffer', data: Buffer }
	| { kind: 'array', data: Array<number> }
	| { kind: 'stream', data: NodeJS.ReadableStream }
	| { kind: 'silence', duration: seconds }
	| { kind: 'hold', data: Promise<Array<Source>> }

type Queue =
	| Source
	| { kind: 'time', data: Deferred<number> }
	| { kind: 'stream_wait', data: NodeJS.ReadableStream }
	| { kind: 'hold_wait' }

export interface Hold {
	time : Promise<number>;
	cb : (sources : Array<Source>) => any;
}

export class AudioStager extends Readable {
	private queue : Array<Queue> = [];

	private headTime : number = 0;
	private paused : boolean = false;
	private timer : NodeJS.Timer;

	sampleRate : number;

	constructor(sampleRate : number) {
		super();

		this.sampleRate = sampleRate;
	}

	currentTime() : Promise<number> {
		if (this.queue.length === 0) {
			return Promise.resolve(this.headTime);
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

	static convertFloats(data : Array<number>) : Buffer {
		const buf = new Buffer(data.length * bytesPerSample);
		data.forEach((el, i) => {
			const sample = Math.max(Math.min(el, 1), -1) * maxSample | 0;
			buf.writeInt16LE(sample, i*bytesPerSample);
		});
		return buf;
	}

	appendFloats(data : Array<number>) : Promise<number> {
		return this.append({ kind: 'array', data });
	}

	append(source : Source) : Promise<number> {
		const start = this.currentTime();
		this.queue.push(source);
		this._unpause();
		return start;
	}

	private _pushBuffer(buf : Buffer) : boolean {
		this.headTime += buf.length / this.sampleRate / bytesPerSample;
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
				if (src.data.length === 0) return true;
				return this._pushBuffer(src.data);

			case 'array':
				if (src.data.length === 0) return true;
				return this._pushBuffer(AudioStager.convertFloats(src.data));

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
				src.data.resolve(this.headTime);
				return true;

			case 'silence':
				const samples = (src.duration * this.sampleRate) | 0;
				if (samples <= 0) return true;

				for (let left = samples * bytesPerSample; left > 0; left -= zeroBuffer.length) {
					if (!this._pushBuffer(zeroBuffer.slice(0, left))) {
						left -= zeroBuffer.length;
						if (left > 0) {
							this.queue.unshift({
								kind: 'silence',
								duration: left / this.sampleRate / bytesPerSample,
							});
						}
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

			if (!this._handleSource()) {
				return;
			}
		}

		if (this.paused) {
			this.timer = setTimeout(() => {
				// There should be nothing in the queue AND we are paused
				if (this.queue.length === 0) {
					this._pushBuffer(zeroBuffer);
				} else {
					this._unpause();
				}
			}, zeroBuffer.length / this.sampleRate / bytesPerSample * 1000);
		}
	}
}

export interface SyncPoint {
	source: Source;
	offset: seconds;
	stager: AudioStager;
}

export function sync(points : Array<SyncPoint>) : Promise<void> {
	const holds = points.map(({ stager }) => stager.hold());
	return Promise.all(holds.map(({time}) => time))
		.then((times) => {
			const offsets = points.map(({ offset }, index) => offset - times[index]);
			const minOffset = Math.min(...offsets);

			points.forEach(({ stager, source }, index) => {
				holds[index].cb([
					{ kind: 'silence', duration: offsets[index] - minOffset },
					source,
				]);
			});
		});
}

export function sync_separate(sources : Source[], offsets : seconds[], stagers : AudioStager[]) {
	return sync(sources.map((source, i) => {
		return {
			source,
			offset: offsets[i],
			stager: stagers[i],
		};
	}));
}
