import { AudioStager } from './audio';
import { Cast, CastBrowser, CastServer } from './cast';

const chirp : Array<number> = [];

let audios : AudioStager[] = [];

const samplesPerCycle = 44100 / 300;

for (let i = 0; i < 10000; ++i) {
	chirp.push(Math.sin(i % samplesPerCycle / samplesPerCycle * Math.PI * 2) * 5000 | 0);
}

let addAudio = () => {
	let stager = new AudioStager();
	audios.push(stager);
	return stager;
}

const server = new CastServer();

server.start();

let hasRun : boolean = false;

new CastBrowser(x => {
	server.addStream(addAudio(), x).launchMedia();
});

setInterval(() => {
	const time = audios.map((audio => audio.appendSamples(chirp)));
	console.log(time);
}, 5000);
