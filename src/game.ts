import * as fs from 'fs-extra';
import * as WavDecoder from 'wav-decoder';

import { getAmplitudes, order } from './geometry';
import { connect } from './homeward';
import { AudioStager, sync, Source } from './audio';
import { autosync } from './synchronize';
import { Cast, CastBrowser, CastApplication } from './cast';

const port = 11000;
interface Monster {
	x : number,
	y : number,
	time : number,
}

function loadWav(filename : string) : Promise<number[]> {
	return fs.readFile(filename).then((wavdata) => 
		WavDecoder.decode(wavdata)
	).then(result => 
		[...result.channelData[0]]
	);
}

function genMonster(time : number) : Monster {
	const th = Math.random() * 2 * Math.PI;
	return {
		x: Math.cos(th) * 2,
		y: Math.sin(th) * 2,
		time: time + Math.random() * 7,
	};
}

export async function playGame(caster : CastApplication, sampleRate : number) {
	let [growl, bell] = await Promise.all([
		loadWav('Bear Growling-SoundBible.com-2376031.wav'), 
		loadWav('Temple Bell-SoundBible.com-756181215.wav'),
	]);

	let monsters : Monster[] = [];

	let data : number[][] = [];

	for (let time = 0; time < 60; ) {
		const monster = genMonster(time);
		time = monster.time + 2;
		monsters.push(monster);

		while (data.length / sampleRate < time) {
			data.push([0, 0, 0]);
		}

		let amps = getAmplitudes(monster.x, monster.y);

		growl.forEach((sample) => {
			data.push(amps.map(x => x * sample));
		});
	}

	let sounds = order.map((_, idx) => {
		return AudioStager.convertFloats(bell.concat(data.map(x => x[idx])));
	});

	console.log('Constructed game soundtrack');

	let casts = order.map((id) => {
		let cast = caster.casts.get(id);
		if (cast === undefined) throw 'Hello';
		return cast;
	});

	let [sock, _] = await Promise.all([ connect(port), autosync(casts, 10000), ]);

	let startTime = await sync(casts.map((cast, i) => {
		return { 
			stager: cast.audio,
			offset: cast.timeOffset,
			source: {
				kind: 'buffer',
				data: sounds[i],
			} as Source,
		};
	}));
	startTime += 6;

	console.log('Started sounds', startTime, bell.length / sampleRate, Math.floor((startTime + bell.length / sampleRate) * 1000));

	await sock.placeEnemies(monsters.map((monster) => 
		[monster.x, monster.y, Math.floor((monster.time + startTime + bell.length / sampleRate) * 1000)] as [number, number, number]
	));
}
