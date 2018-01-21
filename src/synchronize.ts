import * as express from 'express';
import * as shortid from 'shortid';

import { CastApplication } from './cast';
import { Source, sync } from './audio';
import { Deferred, generateSineWave } from './utils';

export class Synchronizer {
	private socket : SocketIO.Socket;
	private caster : CastApplication;

	private synchronizing : boolean;
	private chirpTimer : NodeJS.Timer;

	constructor (socket : SocketIO.Socket, caster : CastApplication) {
		this.socket = socket;
		this.caster = caster;

		this.socket.on('reset', this._reset);
		this.socket.on('autosync', this._autosync);
		this.socket.on('delay', this._delayCast)
		this.socket.on('chirp', this._chirp);
		this.socket.on('info', this._castInfo);
	}

	private casts() {
		return [...this.caster.casts.values()];
	}

	private _getCast(idx : number) {
		return this.casts()[idx];
	}

	private _castInfo = (idx : number) => {
		const cast = this._getCast(idx);
		this.socket.emit('info', {
			id: cast.castEntity.id,
			idx,
			offset: cast.timeOffset,
		});
	}

	private _chirp = (start : boolean) => {
		clearInterval(this.chirpTimer);
		if (!start) return;

		this.chirpTimer = setInterval(() => {
			let casts = this.casts();

			sync(casts.map((cast, idx) => {
				return {
					stager: cast.audio,
					offset: cast.timeOffset,
					source: {
						kind: 'array',
						data: generateSineWave(cast.audio.sampleRate, idx * 100 + 400, 0.05),
					} as Source,
				};
			}));
		}, 2000);
	}

	private _delayCast = (idx : number, duration : number) => {
		const cast = this._getCast(idx);
		cast.timeOffset += duration;
	}

	private _reset = () => {
		this.caster.casts.forEach(cast => cast.reset());
	}

	private _autosync = (duration : number) => {
		if (this.synchronizing) {
			this.socket.emit('error', {message: 'Already synchronizing'})

			return;
		}

		let casts = this.casts();

		this.synchronizing = true;

		Promise.all(casts.map(cast => cast.audio.currentTime()))
		.then(() => 
			new Promise((resolve) => setTimeout(resolve, msg.duration))
		).then(() => 
			Promise.all(casts.map(cast => cast.audio.currentTime())),
		).then(offsets => {
			casts.forEach((cast, i) => {
				cast.timeOffset = offsets[i];
			});
			this.synchronizing = false;
		});
	}
}