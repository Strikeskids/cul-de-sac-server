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

	audio : AudioStager;

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

	output() : NodeJS.ReadableStream {
		if (!this.started) {
			this.started = true;
			this.audio.pipe(this.encoder, {end: false});
		}

		return this.encoder;
	}

	launchMedia () {
		let host = this.castEntity.ip;
		let client = new CastClient();

		client.connect(host, () => {
			console.log('Connected to %s', host);

			client.launch(DefaultMediaReceiver, (err : any, player : any) => {
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

				player.load(media, { autoplay: true }, (err : any, status : string) => {
				});
			});
		});

		client.on('error', (err) => {
			console.error('Error', err);
			client.close();
		});
	}
}

export class CastApplication {
	casts : Map<string, Cast>;

	app : express.Application;

	port : number;
	url = 'data.mp3';

	constructor (port : number) {
		this.port = port;

		this.casts = new Map();
		this.app = express();

		this.app.get(`/${this.url}`, (req, res) => {
			console.log(parseIP(req.ip));

			const incomingIP = parseIP(req.ip);
			const cast = this.casts.get(incomingIP);

			if (cast !== undefined) {
				res.set({
					'Content-Type': 'audio/mpeg3',
					'Transfer-Encoding': 'chunked',
				});

				cast.output().pipe(res);
			} else {
				console.log(incomingIP);
				res.sendStatus(404);
			}
		});
	}

	addStream (audio : AudioStager, castEntity : CastEntity) : Cast {
		let cast = new Cast(audio, castEntity, this.port, this.url);
		this.casts.set(castEntity.ip, cast);
		return cast;
	}
}