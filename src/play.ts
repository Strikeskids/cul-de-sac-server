import * as fs from 'fs-extra';
import * as WavDecoder from 'wav-decoder';

import { AudioStager, sync, Source } from './audio';
import { getAmplitudes, order } from './geometry';
import { Cast, CastBrowser, CastApplication } from './cast';
import { autosync } from './synchronize';

export function playSong(caster : CastApplication, sampleRate : number, spinDuration : number = 10, path = 'song.wav') {
	fs.readFile('song.wav').then((wavdata) => 
		WavDecoder.decode(wavdata)
	).then((song) => {
		let triples = [...song.channelData[0]].map((sample, idx) => {
			const th = idx * Math.PI * 2 / sampleRate / spinDuration;
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
}
