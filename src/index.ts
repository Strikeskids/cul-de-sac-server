import * as express from 'express';
import * as SocketIO from 'socket.io';
import * as WavDecoder from 'wav-decoder';
import { Server } from 'http';
import * as fs from 'fs-extra';

import { AudioStager, sync, Source } from './audio';
import { Cast, CastBrowser, CastApplication } from './cast';
import { generateSineWave } from './utils';
import { Synchronizer } from './synchronize';

const sampleRate = 44100;
const port = 5555;

const chirp : Source = {
	kind: 'array',
	data: generateSineWave(sampleRate, 1000, 0.05).map((a) => a / 10),
}

const caster = new CastApplication(port);
let http = new Server(caster.app);
let io = SocketIO(http);

let seen = false;

new CastBrowser(x => {
	caster.addStream(new AudioStager(sampleRate), x).launchMedia();
});

function chirpStream(idx : number, total : number) : Source {
	let events : Source[] = [
		{
			kind: 'array',
			data: generateSineWave(sampleRate, 1000, 0.05).map((a) => a / 10),
		},
		{
			kind: 'silence',
			duration: .5,
		},
	];

	let result : Source = {
		kind: 'hold',
		data: Promise.resolve(events),
	};
	events.push(result);

	return result;
}

new Promise((resolve) => setTimeout(resolve, 20000))
.then(() => 
	Promise.all([...caster.casts.values()].map((cast) => cast.audio.currentTime())),
).then((offsets) =>
	Promise.all([
		offsets, 
		fs.readFile('song.wav').then((wavdata) => WavDecoder.decode(wavdata)),
	])
).then(([offsets, song]) => {
	setInterval(() => {
		sync([...caster.casts.values()].map((cast, i) => {
			return { 
				stager: cast.audio,
				offset: offsets[i],
				source: chirp,
			}
		}));
	}, 2000);
	// sync([...caster.casts.values()].map((cast, i) => {
	// 	return { 
	// 		stager: cast.audio,
	// 		offset: offsets[i],
	// 		source: {
	// 			kind: 'array',
	// 			data: [...song.channelData[0]],
	// 		} as Source,
	// 	};
	// }));
});

io.on('connection', (socket) => {
	console.log('Got connection');
	const syncer = new Synchronizer(socket);
	const casts = [...caster.casts.values()];
	Promise.all(
		casts.map((cast) => syncer.synchronize(cast.castEntity.id, cast.audio))
	).then((offsets) => {
		sync(casts.map((cast, i) => {
			return { 
				stager: cast.audio,
				offset: offsets[i],
				source: chirpStream(i, casts.length),
			}
		}));
	});
});

http.listen(port, () => {
	console.log('Started server on', port);
});
