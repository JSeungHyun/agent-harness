import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeJunitXml } from '../lib/evidence.mjs';
import { fixture } from './scene.mjs';

test('테스트가 있고 실패가 없으면 통과다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-pass.xml')]);
  assert.equal(r.ok, true);
  assert.equal(r.reason, '테스트 3 · 실패 0');
});

test('⭐ tests="0" 스위트는 성공이 아니다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-empty.xml')]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /실행된 테스트가 0개/);
});

test('⭐ node --test 가 통과로 센 「테스트 없는 파일」은 테스트가 아니다', () => {
  const r = judgeJunitXml([fixture('junit-node-stub.xml')]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /실행된 테스트가 0개/);
  assert.match(r.reason, /테스트 없는 파일 1개/);
});

test('POSIX 경로의 테스트 없는 파일도 알아본다', () => {
  const xml = '<testsuites><testcase name="test/empty.test.mjs" classname="test" file="/work/app/test/empty.test.mjs"/></testsuites>';
  assert.match(judgeJunitXml([xml]).reason, /테스트 없는 파일 1개/);
});

test('속성 순서와 무관하게 failure·error 를 실패로 센다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-fail.xml')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '테스트 4 · 실패 3');
});

test('node 출력에서 건너뜀과 테스트 없는 파일을 빼고 센다', () => {
  const r = judgeJunitXml([fixture('junit-node-mixed.xml')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '테스트 2 · 실패 1 · 건너뜀 1 · 테스트 없는 파일 1개는 세지 않았다');
});

test('여러 XML 을 합산한다 — 하나라도 실패면 실패다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-pass.xml'), fixture('junit-gradle-fail.xml')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '테스트 7 · 실패 3');
});

test('⛔ 전부 건너뛰었으면 실행된 테스트가 0개다', () => {
  const xml = '<testsuite tests="2"><testcase name="a"><skipped/></testcase><testcase name="b"><skipped/></testcase></testsuite>';
  const r = judgeJunitXml([xml]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /0개.*건너뜀 2/);
});

test('이름에 > 가 들어가도 testcase 를 놓치지 않는다', () => {
  const r = judgeJunitXml(['<testsuite><testcase name="a > b" classname="x"/></testsuite>']);
  assert.equal(r.ok, true);
  assert.equal(r.reason, '테스트 1 · 실패 0');
});

test('⭐ XML 이 한 개도 없으면 실패다 — 테스트가 안 돈 것이다', () => {
  assert.match(judgeJunitXml([]).reason, /한 개도/);
  assert.match(judgeJunitXml(['<?xml version="1.0"?><other/>']).reason, /한 개도/);
});
