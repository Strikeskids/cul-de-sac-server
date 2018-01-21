import * as express from 'express';
import * as SocketIO from 'socket.io';
import * as WavDecoder from 'wav-decoder';
import { Server } from 'http';
import * as fs from 'fs-extra';

import { AudioStager, sync, Source } from './audio';
import { Cast, CastBrowser, CastApplication } from './cast';
import { generateSineWave } from './utils';
import { Synchronizer, autosync, chirp } from './synchronize';
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


io.on('connection', (socket) => new Synchronizer(socket, caster));

new Promise(resolve => setTimeout(resolve, 3000))
.then(() => autosync([...caster.casts.values()], 10000))
.then(() => chirp([...caster.casts.values()]))

// const chirp : Source = {
// 	kind: 'array',
// 	data: generateSineWave(sampleRate, 1000, 0.05).map((a) => a / 10),
// };

// fs.readFile('song.wav').then((wavdata) => 
// 	WavDecoder.decode(wavdata)
// ).then((song) => {
// 	let data = AudioStager.convertFloats([...song.channelData[0]]);
// 	new Promise((resolve) => setTimeout(resolve, 10000))
// 	.then(() => 
// 		Promise.all([...caster.casts.values()].map((cast) => cast.audio.currentTime())),
// 	).then((offsets) => {
// 		setInterval(() => {
// 			sync([...caster.casts.values()].map((cast, i) => {
// 				return { 
// 					stager: cast.audio,
// 					offset: cast.timeOffset,
// 					source: chirp,
// 				}
// 			}));
// 		}, 2000);
// 		// sync([...caster.casts.values()].map((cast, i) => {
// 		// 	return { 
// 		// 		stager: cast.audio,
// 		// 		offset: offsets[i],
// 		// 		source: {
// 		// 			kind: 'buffer',
// 		// 			data: data,
// 		// 		} as Source,
// 		// 	};
// 		// }));
// 	});
// });
