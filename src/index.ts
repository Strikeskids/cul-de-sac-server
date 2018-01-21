import * as express from 'express';
import * as SocketIO from 'socket.io';
import { Server } from 'http';

import { AudioStager, sync, Source } from './audio';
import { Cast, CastBrowser, CastApplication } from './cast';
import { generateSineWave } from './utils';
import { Synchronizer, autosync, startChirping } from './synchronize';
import { playGame } from './game';
import { playSong } from './play';

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

switch (process.argv[2]) {
	case 'game':
		console.log('Playing game');
		playGame(caster, sampleRate);
		break;
	case 'song':
		console.log('Playing song');
		playSong(caster, sampleRate);
		break;
}

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
