"use strict";

import { createServer, Server } from "net";
import * as EventEmitter from "events";

export interface HomewardSocket {
	placeEnemy(x: number, y: number, time: number): Promise<void>;
	placeEnemies(data : Array<[number, number, number]>) : Promise<void>;
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
			console.log('Playing game')
			async function request(obj: any): Promise<any> {
				await new Promise((resolve) => 
					socket.write(JSON.stringify(obj) + '\n', "ascii", resolve)
				);
				return await new Promise<any>((resolve, reject) => {
					socket.once("data", (data) => {
						let content = data.toString();
						let object = JSON.parse(content);
						resolve(object);
					});
				});
			}

			resolve({
				placeEnemies: async (data : Array<[number, number, number]>): Promise<void> => {
					await request(
						{ data: data.map(([x, y, time]) => { 
								return {
									kind: "spawn",
									spawnData: {x, y, time},
								}; 
							}),
						}
					);
				},
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