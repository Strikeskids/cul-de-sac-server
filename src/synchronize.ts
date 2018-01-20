import * as express from 'express';
import * as shortid from 'shortid';

import { AudioStager } from './audio';
import { Deferred, generateSineWave } from './utils';

interface Session {
	audio : AudioStager;
	startTime? : Promise<number>;
	result : Deferred<number>;
}

export class Synchronizer {
	private socket : SocketIO.Socket;

	private sessions : Map<string, Session>;

	constructor (socket : SocketIO.Socket) {
		this.socket.on('recv timestamp', this.receiveTimestamp);
		this.socket.on('send timestamp', this.sendTimestamp);
	}

	private receiveTimestamp = (id : string, timestamp : number) => {
		const session = this.sessions.get(id);
		if (session !== undefined) {
			if (session.startTime === undefined) {
				console.error('Unexpected recv timestamp', id);
				return;
			}
			session.startTime.then((time) => {
				session.result.resolve(timestamp - time);
				this.sessions.delete(id);
			});
		}
	}

	private sendTimestamp = (id : string, freq : number) => {
		const session = this.sessions.get(id);
		if (session !== undefined) {
			if (session.startTime !== undefined) {
				console.error('Unexpected send timestamp', id);
				return;
			}
			session.startTime = session.audio.appendFloats(
				generateSineWave(session.audio.sampleRate, freq, 1)
			);
		}
	}

	synchronize (id : string, audio : AudioStager) {
		const result = new Deferred<number>();
		this.sessions.set(id, { audio, result });

		return result.promise;
	}
}