import * as express from 'express';
import * as SocketIO from 'socket.io';
import * as WavDecoder from 'wav-decoder';
import { Server } from 'http';
import * as fs from 'fs-extra';

import { AudioStager, sync, Source } from './audio';
import { Cast, CastBrowser, CastApplication } from './cast';
import { generateSineWave } from './utils';
import { Synchronizer, autosync, startChirping } from './synchronize';
import { getAmplitudes } from './geometry';

const sampleRate = 44100;
const port = 5555;

const caster = new CastApplication(port);
let server = new Server(caster.app);
let io = SocketIO(server);

caster.autoload(sampleRate);
server.listen(port, () => {
	console.log('Started server on', port);
});


io.on('connection', (socket) => {
	console.log('New Synchronizer');
	new Synchronizer(socket, caster);
});

const chirp : Source = {
	kind: 'array',
	data: generateSineWave(sampleRate, 1000, 0.05).map((a) => a / 10),
};

let order = [
	'98790a8ee42ab38e307b119c1c229231',
	'658b7cbc2f2ccba278ddc91f12f50102',
	'1a7465ef1a47f71c16e00777ddbd9763',
];

// new Promise(resolve => setTimeout(resolve, 3000))
// .then(() => autosync([...caster.casts.values()], 10000))
// .then(() => {
// 	let casts = order.map((id) => {
// 		let cast = caster.casts.get(id);
// 		if (cast === undefined) throw 'Hello';
// 		return cast;
// 	});

// 	let time = 0;

// 	setInterval(() => {
// 		const x = Math.cos(time * Math.PI / 4) *2;
// 		const y = Math.sin(time * Math.PI / 4) * 2;
// 		time++;

// 		let amplitudes = getAmplitudes(x, y);
// 		console.log(x, y, amplitudes);

// 		sync(casts.map((cast, idx) => {
// 			return {
// 				stager: cast.audio,
// 				offset: cast.timeOffset,
// 				source: {
// 					kind: 'array',
// 					data: generateSineWave(sampleRate, 500, 2).map(x => x * amplitudes[idx]),
// 				} as Source,
// 			};
// 		}));
// 	}, 5000);
// });

fs.readFile('song.wav').then((wavdata) => 
	WavDecoder.decode(wavdata)
).then((song) => {
	let triples = [...song.channelData[0]].map((sample, idx) => {
		const th = idx * Math.PI * 2 / sampleRate / 10;
		const x = Math.cos(th) * 2;
		const y = Math.sin(th) * 2;

		return getAmplitudes(x, y).map(a => a * sample);
	});

	let data = order.map((_, idx) => {
		return AudioStager.convertFloats(triples.map(x => x[idx]));
	});

	let casts = order.map((id) => {
		let cast = caster.casts.get(id);
		if (cast === undefined) throw 'Hello';
		return cast;
	});

	autosync(casts, 10000).then(() => {
		// setInterval(() => {
		// 	sync([...caster.casts.values()].map((cast, i) => {
		// 		return { 
		// 			stager: cast.audio,
		// 			offset: cast.timeOffset,
		// 			source: chirp,
		// 		}
		// 	}));
		// }, 2000);
		sync(casts.map((cast, i) => {
			return { 
				stager: cast.audio,
				offset: cast.timeOffset,
				source: {
					kind: 'buffer',
					data: data[i],
				} as Source,
			};
		}));
	});
});
