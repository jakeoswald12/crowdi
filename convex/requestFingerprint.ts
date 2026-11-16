import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Value } from "convex/values";
import { stableRequest } from "./access.ts";

export const requestFingerprint = (value: Value) =>
  bytesToHex(sha256(new TextEncoder().encode(stableRequest(value))));
