import assert from "node:assert/strict";
import {test} from "node:test";
import {photoKind} from "./photo-policy.ts";
test("only bounded image signatures can enter private photo storage",()=>{assert.equal(photoKind(new Uint8Array([255,216,255,1])),"jpeg");assert.equal(photoKind(new Uint8Array([137,80,78,71,13,10,26,10])),"png");assert.equal(photoKind(new TextEncoder().encode("<svg onload='x'>")),null);assert.equal(photoKind(new Uint8Array(786433)),null)});
