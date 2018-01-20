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

	constructor (service : mdns.Service) {
		this.name = service.txtRecord.fn;
		this.ip = parseIP(service.addresses[0]);
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
	encoder : Encoder;
	castEntity : CastEntity;
	audio : AudioStager;

	port : number;
	url : string;

	launched = false;
	ip : string;
	started = false;

	constructor(audio : AudioStager, castEntity : CastEntity, port : number, url : string) {
		this.castEntity = castEntity;
		this.audio = audio;

		this.port = port;
		this.url = url;

		this.encoder = new Encoder({
			channels: 1,
			bitDepth: 16,
			sampleRate: 44100,

			bitRate: 128,
			outSampleRate: 44100,
			mode: MONO,
		});

		this.ip = getIp();
	}

	launchMedia() {
		let host = this.castEntity.ip;
		let client = new CastClient();

		client.connect(host, () => {
			console.log('Connected');
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
					console.log('err=%s playerState=%s', err, status);
				});
			});
		});

		client.on('error', (err) => {
			console.error('Error: %s', err.message);
			client.close();
		});
	}
}

export class CastServer {
	app : express.Application;
	server : Server;

	encoders : Map<string, Cast>;

	url = 'data.mp3';
	port = 5555;

	constructor () {
		this.encoders = new Map();
		this.app = express();
		this.app.get(`/${this.url}`, (req, res) => {
			console.log(utils.parseIP(req.ip));
			let incomingIP = utils.parseIP(req.ip);
			let cast = this.encoders.get(incomingIP);
			if (cast !== undefined) {
				res.set({
					'Content-Type': 'audio/mpeg',
					'Transfer-Encoding': 'chunked',
				});

				cast.encoder.pipe(res);

				if (!cast.started) {
					cast.started = true;
					cast.audio.pipe(cast.encoder);
				}
			} else {
				console.log(incomingIP);
				res.sendStatus(404)
			}
		});
	}

	addStream (audio : AudioStager, castEntity : CastEntity) : Cast {
		let cast = new Cast(audio, castEntity, this.port, this.url);
		this.encoders.set(castEntity.ip, cast);
		return cast
	}

	start() {
		this.server = this.app.listen(this.port);
	}
}