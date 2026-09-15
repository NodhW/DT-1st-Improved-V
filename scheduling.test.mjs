import test from 'node:test';
import assert from 'node:assert/strict';
import { findBestSlot } from '../src/lib/scheduling.js';

test('findBestSlot finds first free window',()=>{ const base=new Date(2026,0,5); const events=[{starts_at:new Date(2026,0,5,6).toISOString(),ends_at:new Date(2026,0,5,7).toISOString()},{starts_at:new Date(2026,0,5,8).toISOString(),ends_at:new Date(2026,0,5,9,30).toISOString()}]; assert.equal(findBestSlot(events,45,6,22,base).getHours(),7); });
test('findBestSlot uses evening fallback when full',()=>{ const base=new Date(2026,0,5); const events=[{starts_at:new Date(2026,0,5,6).toISOString(),ends_at:new Date(2026,0,5,22).toISOString()}]; const result=findBestSlot(events,45,6,22,base); assert.equal(result.getHours(),18); assert.equal(result.getMinutes(),30); });
