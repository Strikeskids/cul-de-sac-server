import { AudioStager } from './audio';
import { Cast } from './cast';

const chirp : Array<number> = [];

const samplesPerCycle = 44100 / 300;

for (let i = 0; i < 10000; ++i) {
	chirp.push(Math.sin(i % samplesPerCycle / samplesPerCycle * Math.PI * 2) * 5000 | 0);
}

const audio = new AudioStager();
const cast = new Cast(audio);

cast.start();

setInterval(() => {
	const time = audio.appendSamples(chirp);
	console.log(time);
}, 5000);
