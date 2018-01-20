import { AudioStager } from './audio';
import { Encoder, MONO } from 'lame';
import { Server } from 'http';

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

export class Cast {
	encoder : Encoder;
	app : express.Application;
	server : Server;

	castBrowser : mdns.Browser;

	launched = false;
	url = 'data.mp3';
	port = 5555;
	ip : string;
	started = false;

	constructor(audio : AudioStager) {
		this.encoder = new Encoder({
			channels: 1,
			bitDepth: 16,
			sampleRate: 44100,

			bitRate: 128,
			outSampleRate: 44100,
			mode: MONO,
		});

		this.ip = getIp();

		this.castBrowser = mdns.createBrowser(mdns.tcp('googlecast'));
		this.castBrowser.on('serviceUp', (service) => {
			if (!this.launched) this.launchMedia(service.addresses[0]);
			this.launched = true;
			this.castBrowser.stop();
		});

		this.app = express();
		this.app.get('/' + this.url, (req, res) => {
			res.set({
				'Content-Type': 'audio/mpeg',
				'Transfer-Encoding': 'chunked',
			});

			this.encoder.pipe(res);

			if (!this.started) {
				this.started = true;
				audio.pipe(this.encoder);
			}
		});
	}

	start() {
		this.castBrowser.start();
		this.server = this.app.listen(this.port);
	}

	launchMedia(host : string) {
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