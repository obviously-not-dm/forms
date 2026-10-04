import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  parseSet,
  parseNumber,
  guessCompare,
  isAnswered,
  isCorrect,
  grade,
  describe,
} from "../src/grade.js";

test("normalize handles spaces, case, lookalike letters and empty sets", () => {
  assert.equal(normalize("  Слово  "), "cлoвo");
  assert.equal(normalize("Ёлка"), "eлкa");
  assert.equal(normalize("∅"), "{}");
  assert.equal(normalize("\\emptyset"), "{}");
  assert.equal(normalize("\\varnothing"), "{}");
  assert.equal(normalize("слово."), "cлoвo");
  assert.equal(normalize("."), ".");
});

test("parseNumber parses various valid numeric representations", () => {
  assert.equal(parseNumber("42"), 42);
  assert.equal(parseNumber("-5"), -5);
  assert.equal(parseNumber("+10"), 10);
  assert.equal(parseNumber("3,14"), 3.14);
  assert.equal(parseNumber("3.14"), 3.14);
  assert.equal(parseNumber(" 7 "), 7);
  assert.equal(parseNumber("5."), 5);
  assert.equal(parseNumber("abc"), null);
});

test("parseSet canonicalizes sets regardless of order and formatting", () => {
  assert.equal(parseSet("{2, 1}"), "{1,2}");
  assert.equal(parseSet("{1, 2, 2, 1}"), "{1,2}");
  assert.equal(parseSet("{}"), "{}");
  assert.equal(parseSet("∅"), "{}");
  assert.equal(parseSet("\\emptyset"), "{}");
  assert.equal(parseSet("{1, 2,}"), "{1,2}");
  assert.equal(parseSet("{(2, 1), (1, 2)}"), "{(1,2),(2,1)}");
  assert.equal(parseSet("{{2}, {1}}"), "{{1},{2}}");
  assert.equal(parseSet("not-a-set"), null);
});

test("guessCompare detects type accurately", () => {
  assert.equal(guessCompare(["1", "2"]), "number");
  assert.equal(guessCompare(["{1}", "{2, 3}"]), "set");
  assert.equal(guessCompare(["да", "нет"]), "text");
});

test("isAnswered validates presence of answers", () => {
  assert.equal(isAnswered("single", 0), true);
  assert.equal(isAnswered("single", null), false);
  assert.equal(isAnswered("multiple", [1]), true);
  assert.equal(isAnswered("multiple", []), false);
  assert.equal(isAnswered("text", "ответ"), true);
  assert.equal(isAnswered("text", "   "), false);
});

test("isCorrect validates single and multiple choice questions", () => {
  const singleQ = { type: "single", answer: [2] };
  assert.equal(isCorrect(singleQ, 2), true);
  assert.equal(isCorrect(singleQ, 1), false);

  const multiQ = { type: "multiple", answer: [0, 2] };
  assert.equal(isCorrect(multiQ, [2, 0]), true);
  assert.equal(isCorrect(multiQ, [0]), false);
  assert.equal(isCorrect(multiQ, [0, 1, 2]), false);
});

test("isCorrect validates set questions with order and whitespace insensitivity", () => {
  const setQ = { type: "text", answer: ["{1, 2, 3}"], compare: "set" };
  assert.equal(isCorrect(setQ, "{3, 1, 2}"), true);
  assert.equal(isCorrect(setQ, "{1, 2, 3,}"), true);
  assert.equal(isCorrect(setQ, "{1, 2}"), false);
});

test("isCorrect validates numeric answers", () => {
  const numQ = { type: "text", answer: ["5"], compare: "number" };
  assert.equal(isCorrect(numQ, "5"), true);
  assert.equal(isCorrect(numQ, "5.0"), true);
  assert.equal(isCorrect(numQ, " 5 "), true);
  assert.equal(isCorrect(numQ, "5."), true);
  assert.equal(isCorrect(numQ, "+5"), true);
  assert.equal(isCorrect(numQ, "6"), false);
});

test("isCorrect validates text answers with multiple alternatives and trailing periods", () => {
  const textQ = { type: "text", answer: ["порождающим", "порождающий"], compare: "text" };
  assert.equal(isCorrect(textQ, "порождающим"), true);
  assert.equal(isCorrect(textQ, "порождающий"), true);
  assert.equal(isCorrect(textQ, "Порождающим."), true);
  assert.equal(isCorrect(textQ, "другое"), false);
});

test("grade calculates score correctly", () => {
  const questions = [
    { id: "1", type: "single", answer: [0] },
    { id: "2", type: "text", answer: ["5"], compare: "number" },
  ];
  const answers = { "1": 0, "2": "5" };
  const res = grade(questions, answers);
  assert.equal(res.score, 2);
  assert.equal(res.max, 2);
  assert.equal(res.results["1"], true);
  assert.equal(res.results["2"], true);
});

test("describe formats answers for display", () => {
  const q = { type: "single", labels: ["А) вариант 1", "Б) вариант 2"] };
  assert.equal(describe(q, 1), "Б) вариант 2");
  assert.equal(describe(q, null), "нет ответа");
});
