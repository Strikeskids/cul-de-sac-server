declare module 'lame' {
	import { Transform } from 'stream';

	export interface EncoderOptions {
		channels: number;
		bitDepth: number;
		sampleRate: number;

		bitRate: number;
		outSampleRate: number;
		mode: number;
	}

	export class Encoder extends Transform {
		constructor(options : EncoderOptions);
	}

	export const MONO : number;
}