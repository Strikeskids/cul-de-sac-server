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
		this.socket = socket;
		this.sessions = new Map();

		this.socket.on('timestamp', this.receiveTimestamp);
		this.socket.on('requestSync', this.sendTimestamp);
	}

	private receiveTimestamp = (id : string, timestamp : number) => {
		console.log('Recieved timestamp', id, timestamp);
		const session = this.sessions.get(id);
		if (session !== undefined) {
			if (session.startTime === undefined) {
				console.error('Unexpected recv timestamp', id);
				return;
			}
			session.startTime.then((time) => {
				console.log('Synced', id, timestamp - time)
				session.result.resolve(timestamp - time);
				this.sessions.delete(id);
			});
		} else {
			console.error('Session not found', id);
		}
	}

	private sendTimestamp = (id : string, freq : number) => {
		console.log('Send timestamp', id, freq);
		const session = this.sessions.get(id);
		if (session !== undefined) {
			if (session.startTime !== undefined) {
				console.error('Unexpected send timestamp', id);
				return;
			}
			session.startTime = session.audio.appendFloats(
				generateSineWave(session.audio.sampleRate, freq, 1)
			);
		} else {
			console.error('Session not found', id);
		}
	}

	synchronize (id : string, audio : AudioStager) {
		console.log('Setup for synchronize', id);
		const result = new Deferred<number>();
		this.sessions.set(id, { audio, result });

		return result.promise;
	}
}