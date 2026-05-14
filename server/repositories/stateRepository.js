import { readState, writeState } from "../db.js";

export async function readAppState() {
  return readState();
}

export async function writeAppState(nextState) {
  return writeState(nextState);
}

