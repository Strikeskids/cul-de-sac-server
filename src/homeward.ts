"use strict";

import { createServer, Server } from "net";
import * as EventEmitter from "events";

export interface HomewardSocket {
	placeEnemy(x: number, y: number, time: number): Promise<void>;
}

interface HomewardPlaceEnemyRequest {
	kind: "spawn";
	spawnData: {
		x: number;
		y: number;
		time: number;
	};
}

interface HomewardGetTimeRequest {
	kind: "time";
}

type HomewardRequest =
	| HomewardPlaceEnemyRequest
	| HomewardGetTimeRequest;

interface HomewardResponse {
	kind: "init";
	time: number;
}

export function connect(port: number): Promise<HomewardSocket> {
	return new Promise((resolve, reject) => {
		createServer((socket) => {
			function request(obj: HomewardRequest): Promise<HomewardResponse> {
				return new Promise((resolve, reject) => {
					socket.once("data", (data) => {
						let content = data.toString();
						let object = JSON.parse(content) as HomewardResponse;
						resolve(object);
					});
				});
			}

			resolve({
				placeEnemy: async (x: number, y: number, time: number): Promise<void> => {
					await request({
						kind: "spawn",
						spawnData: { x, y, time }
					});
				}
			});
		}).listen(port);
	});
}