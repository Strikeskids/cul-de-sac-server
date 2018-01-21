"use strict";

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
	const theta = Math.atan2(y0, x0);

	if (theta1 <= theta && theta < theta2) { // Case A - front pair
		const dRatio = Math.pow(d1 / d0, 3);
		const a1 = 0.5 * dRatio * ((y0 / y1) - (x0 / x));
		const a2 = 0.5 * dRatio * ((y0 / y1) - (x0 / x));
		const a3 = 0;
		return [a1, a2, a3];
	} else if (theta2 <= theta && theta < theta3) { // Case B - left pair
		const a1 = Math.pow(d1 / d0, 3) * (-(x0 / x));
		const a2 = 0;
		const a3 = y2 * y2 * (((a1 * y1) / Math.pow(d1, 3)) - (y0 / Math.pow(d0, 3)));
		return [a1, a2, a3];
	} else { // Case C - right pair
		const a1 = 0;
		const a2 = Math.pow(d1 / d0, 3) * (x0 / x);
		const a3 = y2 * y2 * (((a2 * y1) / Math.pow(d1, 3)) - (y0 / Math.pow(d0, 3)));
		return [a1, a2, a3];
	}
}