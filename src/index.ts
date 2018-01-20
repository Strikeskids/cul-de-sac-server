import * as express from 'express';
import * as SocketIO from 'socket.io';
import { Server } from 'http';

import { AudioStager, sync, Source } from './audio';
import { Cast, CastBrowser, CastApplication } from './cast';
import { generateSineWave } from './utils';
import { Synchronizer } from './synchronize';

const sampleRate = 44100;
const port = 5555;

const chirp : Source = {
	kind: 'array',
	data: generateSineWave(sampleRate, 600, 0.5),
}

const caster = new CastApplication(port);
let http = new Server(caster.app);
let io = SocketIO(http);

new CastBrowser(x => {
	caster.addStream(new AudioStager(sampleRate), x).launchMedia();
});

function chirpStream(idx : number, total : number) : Source {
	let events : Source[] = [
		{
			kind: 'silence',
			duration: idx * 0.5,
		},
		{
			kind: 'array',
			data: generateSineWave(sampleRate, 500, 0.5).map((a) => a / 10),
		},
		{
			kind: 'silence',
			duration: (total - idx - 1) * 0.5,
		},
	];

	let result : Source = {
		kind: 'hold',
		data: Promise.resolve(events),
	};
	events.push(result);

	return result;
}

io.on('connection', (socket) => {
	console.log('Got connection');
	const syncer = new Synchronizer(socket);
	const casts = [...caster.casts.values()];
	Promise.all(
		casts.map((cast) => syncer.synchronize(cast.castEntity.id, cast.audio))
	).then((offsets) =>
		Promise.all(casts.map((cast) => syncer.synchronize(cast.castEntity.id, cast.audio)))
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
