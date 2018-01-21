import { AudioStager } from './audio';
import { Encoder, MONO } from 'lame';
import { Server } from 'http';

import { parseIP } from './utils';

import * as os from 'os';

import { Client as CastClient, DefaultMediaReceiver } from 'castv2-client';
import * as mdns from 'mdns';

import * as express from 'express';

function getIp() : string {
	const ifaces = os.networkInterfaces();

	let result : string | undefined = undefined;

	Object.keys(ifaces).forEach((ifname) => {
	  var alias = 0;

	  ifaces[ifname].forEach((iface) => {
		if ('IPv4' !== iface.family || iface.internal !== false) {
		  // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
		  return;
		}

		if (alias >= 1) {
		  // this single interface has multiple ipv4 addresses
		  result = result || iface.address;
		} else {
		  // this interface has only one ipv4 adress
		  result = result || iface.address;
		}
	  });
	});

	return result || '127.0.0.1';
}

export class CastEntity {
	name : string;
	ip : string;
	id : string;

	constructor (service : mdns.Service) {
		this.name = service.txtRecord.fn;
		this.ip = parseIP(service.addresses[0]);
		this.id = service.txtRecord.id;
	}
}

export class CastBrowser {
	castBrowser : mdns.Browser;
	allCasts : CastEntity[];

	constructor (cb : (entity : CastEntity) => void) {
		this.castBrowser = mdns.createBrowser(mdns.tcp('googlecast'));
		this.castBrowser.on('serviceUp', (service) => {
			if (service.txtRecord.md === "Google Home") {
				let entity : CastEntity = new CastEntity(service)
				cb(entity);
			}
		});
		this.castBrowser.start();
	}
}

export class Cast {
	private encoder : Encoder;
	private started : boolean;
	private client : CastClient;
	private sessionId : string | undefined;

	audio : AudioStager;
	timeOffset : number = 0;

	castEntity : CastEntity;

	ip : string;
	port : number;
	url : string;

	constructor (audio : AudioStager, castEntity : CastEntity, port : number, url : string) {
		this.castEntity = castEntity;
		this.audio = audio;

		this.port = port;
		this.url = url;

		this.encoder = new Encoder({
			channels: 1,
			bitDepth: 16,
			sampleRate: audio.sampleRate,

			bitRate: 128,
			outSampleRate: audio.sampleRate,
			mode: MONO,
		});

		this.ip = getIp();
	}

	reset () {
		this.audio.reset();
		this.audio.unpipe(this.encoder);
		this.started = false;
		
		const sessionId = this.sessionId;
		this.sessionId = undefined;

		if (sessionId !== undefined) {
			new Promise((resolve, reject) => {
				this.client.stop(sessionId, (err : Error | null) => {
					if (err !== null) reject(err);
					else resolve();
				});
			}).then(() => this.launchMedia());
		}
	}

	output() : NodeJS.ReadableStream {
		if (!this.started) {
			this.started = true;
			this.audio.pipe(this.encoder, {end: false});
		}

		return this.encoder;
	}

	connect () : Promise<CastClient> {
		if (this.client !== undefined && !this.client.closed) 
			return Promise.resolve(this.client);

		return new Promise((resolve) => {
			this.client = new CastClient();
			this.client.on('error', (err) => {
				console.error('Error', err);
				this.client.close();
			});
			this.client.connect(this.castEntity.ip, () => {
				resolve(this.client);
			});
		});
	}

	launchMedia () {
		this.connect().then((client) => 
			new Promise((resolve, reject) => 
				client.launch(DefaultMediaReceiver, (err : Error | null, player : any) => {
					if (err !== null) reject(err);
					else resolve(player);
				})
			)
		).then((player : any) => {
			this.sessionId = player.session.sessionId;
			const media = {
				contentId: 'http://' + this.ip + ':' + this.port + '/' + this.url,
				contentType: 'audio/mpeg3',
				streamType: 'LIVE',

				metadata: {
					type: 0,
					metadataType: 0,
					title: 'Beamformer',
				},
			};

			return new Promise((resolve, reject) => 
				player.load(media, { autoplay: true }, (err : Error | null, status : string) => {
					if (err !== null) reject(err);
					else resolve(status);
				})
			);
		});
	}
}

export class CastApplication {
	byIp : Map<string, Cast>;
	casts : Map<string, Cast>;

	app : express.Application;

	port : number;
	url = 'data.mp3';

	constructor (port : number) {
		this.port = port;

		this.casts = new Map();
		this.byIp = new Map();
		this.app = express();

		this.app.get(`/${this.url}`, (req, res) => {
			const incomingIP = parseIP(req.ip);
			const cast = this.byIp.get(incomingIP);

			if (cast !== undefined) {
				console.log('Casting to', incomingIP);
				res.set({
					'Content-Type': 'audio/mpeg3',
					'Transfer-Encoding': 'chunked',
				});

				cast.output().pipe(res);
			} else {
				console.log('Unknown cast', incomingIP);
				res.sendStatus(404);
			}
		});
	}

	autoload (sampleRate : number) {
		new CastBrowser(x => {
			this.addStream(new AudioStager(sampleRate), x).launchMedia();
		});
	}

	addStream (audio : AudioStager, castEntity : CastEntity) : Cast {
		let cast = new Cast(audio, castEntity, this.port, this.url);
		this.byIp.set(castEntity.ip, cast);
		this.casts.set(castEntity.id, cast);
		return cast;
	}
}