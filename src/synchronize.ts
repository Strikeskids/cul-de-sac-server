import * as express from 'express';
import * as shortid from 'shortid';

import { AudioStager } from './audio';
import { Deferred, generateSineWave } from './utils';

const chirpFrequency = 20000;

interface Session {
	audio : AudioStager;
	startTime : Promise<number>;
	result : Deferred<number>;
}

interface TimestampMessage {
	id : string;
	timestamp : number;
}

export class Synchronizer {
	private socket : SocketIO.Socket;

	private sessions : Map<string, Session>;

	constructor (socket : SocketIO.Socket) {
		this.socket.on('recv timestamp', this.receiveTimestamp);
	}

	private receiveTimestamp = (msg : TimestampMessage) => {
		const session = this.sessions.get(msg.id);
		if (session !== undefined) {
			session.startTime.then((time) => {
				session.result.resolve(msg.timestamp - time);
			});
		}
	}

	synchronize (audio : AudioStager) {
		const id = shortid();

		this.socket.emit('send timestamp', { id, freq: chirpFrequency });

		const startTime = audio.appendFloats(generateSineWave(audio.sampleRate, chirpFrequency, 1));
		const result = new Deferred<number>();

		this.sessions.set(id, {
			audio,
			startTime,
			result,
		});

		return result.promise;
	}
}