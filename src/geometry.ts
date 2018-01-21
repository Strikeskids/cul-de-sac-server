"use strict";

import * as assert from "assert";

// Constants for the positions of the speakers
// Speaker 1 (Chirp) should be x units to the left and y1 units in front of the user
// Speaker 2 (Squawk) should be x units to the right and y1 units in front of the user
// Speaker 3 (Hoot) should be y2 units behind the user
const x = 1; /** @todo */
const y1 = 0.8; /** @todo */
const y2 = 1.5; /** @todo */

// Some computed constants for simplicity
const d1 = dist(x, y1); // Distance from Chrip and Squawk to the user
const d2 = y2;          // Distance from Hoot to the user
const theta1 = Math.atan2(y1, x); // Switchover point between case C and case A
const theta2 = Math.PI - theta1;  // Switchover point between case A and case B
const theta3 = 3 * Math.PI / 2;   // Switchover point between case B and case C

function dist(x: number, y: number): number {
	return Math.sqrt(x*x + y*y);
}

function posmod(val: number, mod: number): number {
	return ((val % mod) + mod) % mod;
}

export const order = [
	'98790a8ee42ab38e307b119c1c229231',
	'658b7cbc2f2ccba278ddc91f12f50102',
	'1a7465ef1a47f71c16e00777ddbd9763',
];

/**
 * Returns the amplitudes for each speaker for a noise of unit amplitude at
 * the given coordinates.
 *
 * @param x0 - the x position of the noise
 * @param y0 - the y position of the noise
 * @return a 3-tuple, consisting of the amplitudes to play at each speaker
 */
export function getAmplitudes(x0: number, y0: number): [number, number, number] {
	const d0 = dist(x0, y0);
	const theta = posmod(Math.atan2(y0, x0), 2 * Math.PI);
	let result: [number, number, number];

	if (theta1 <= theta && theta < theta2) { // Case A - front pair
		const diff = theta2 - theta1;
		const a1 = (theta - theta1) / diff;
		const a2 = 1 - a1;
		const a3 = 0;
		assert(0 <= a1 && a1 <= 1);
		assert(0 <= a2 && a2 <= 1);
		assert(0 <= a3 && a3 <= 1);
		result = [a1, a2, a3];
	} else if (theta2 <= theta && theta < theta3) { // Case B - left pair
		const diff = theta3 - theta2;
		const a3 = (theta - theta2) / diff;
		const a2 = 0;
		const a1 = 1 - a3;
		assert(0 <= a1 && a1 <= 1);
		assert(0 <= a2 && a2 <= 1);
		assert(0 <= a3 && a3 <= 1);
		result = [a1, a2, a3];
	} else { // Case C - right pair
		const diff = theta1 + Math.PI * 2 - theta3; // 2.245537
		const a1 = 0;
		const a2 = posmod(theta - theta3, Math.PI * 2) / diff;
		const a3 = 1 - a2;
		assert(0 <= a1 && a1 <= 1);
		assert(0 <= a2 && a2 <= 1);
		assert(0 <= a3 && a3 <= 1);
		result = [a1, a2, a3];
	}

	let [a1, a2, a3] = result;
	let tot = (a1 / Math.pow(d1, 2)) + (a2 / Math.pow(d1, 2)) + (a3 / Math.pow(y2, 2));
	tot *= d0;
	return [a1/tot, a2/tot, a3/tot];
}