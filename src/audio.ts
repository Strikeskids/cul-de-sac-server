import { Readable } from 'stream';

const zeroBufferSamples = 8192;
const zeroBuffer = Buffer.alloc(zeroBufferSamples * 2);
const sampleRate = 48000;

type Source =
	| { kind: 'buffer', data: Buffer }
	| { kind: 'stream', data: NodeJS.WritableStream }

export class AudioStager extends Readable {
	private buffers : Array<Source>;
	currentEnd : number;
	paused : boolean;
	timer : NodeJS.Timer;

	constructor() {
		super();

		this.buffers = [];
		this.currentEnd = 0;
		this.paused = false;
	}

	appendSamples(data : Array<number>) : number {
		let start = this.currentEnd;
		this.currentEnd += data.length;
		let buf = new Buffer(data.length * 2);
		data.forEach((el, i) => {
			buf.writeInt16LE(el, i*2);
		});
		this.buffers.push({kind: 'buffer', data: buf});
		if (this.paused) this._doRead();
		return start;
	}

	_doRead = () => {
		clearTimeout(this.timer);

		this.paused = true;
		let buf = this.buffers.shift();
		while (buf !== undefined) {
			this.paused = false;
			if (buf.kind === 'buffer') {
				if (!this.push(buf.data)) return;
			}

			buf = this.buffers.shift();
		}

		this.timer = setTimeout(() => {
			this.currentEnd += zeroBufferSamples;
			this.push(zeroBuffer);
		}, zeroBufferSamples / sampleRate * 1000);
	}

	_read(size : number) {
		console.log('Read');
		this._doRead();
	}
}
