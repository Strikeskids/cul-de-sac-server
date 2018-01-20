declare module 'castv2-client' {
	export interface MediaReceiver {}
	export interface LaunchOptions {
		autoplay? : boolean;
	}

	export class Client {
		connect(host : string, callback : () => void) : void;
		launch(media : MediaReceiver, callback : (err : any, player : any) => void) : void;
		on(type: 'error', callback : (err : any) => void) : void;
		close() : void;
	}

	export class DefaultMediaReceiver implements MediaReceiver {

	}
}