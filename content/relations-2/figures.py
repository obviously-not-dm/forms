"""Картинки и сверка ключей тренажёра «БО, часть 2» (лекция 4).
Запуск: python make_figures.py (dm_figures.py рядом). Запуск из папки теста: cd content/bo-2 && python3 figures.py"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "figures"))
from itertools import combinations
from dm_figures import digraph, matrix, chain, partition, compose, closure, classes, properties, inverse


def P(x): return x
def eqrel(blocks): return {(a, b) for B in blocks for a in B for b in B}
def is_eq(A, R):
    p = properties(A, R); return p["рефлексивность"] and p["симметричность"] and p["транзитивность"]

# 6: варианты-графы
A4 = [1, 2, 3, 4]
loops = {(x, x) for x in A4}
q6 = {"А": loops | {(1, 2), (2, 1), (2, 3), (3, 2)},
      "Б": (loops - {(4, 4)}) | {(1, 2), (2, 1), (3, 4), (4, 3)},
      "В": loops | {(1, 2), (2, 1), (3, 4), (4, 3)},
      "Г": loops | {(1, 2), (3, 4), (4, 3)}}
assert [k for k, R in q6.items() if is_eq(A4, R)] == ["В"]
for k, R in q6.items():
    digraph(A4, R, preset="option", path=P(f"q06_{k}.png"))

# 17: число классов по графу
A6 = [1, 2, 3, 4, 5, 6]
R17 = eqrel([[1, 5], [2, 3, 6], [4]])
assert len(classes(A6, R17)) == 3
digraph(A6, R17, path=P("q17.png"))

# 18: рефлексивное замыкание
A5 = [1, 2, 3, 4, 5]
R18 = {(1, 2), (2, 2), (3, 1), (4, 4), (5, 3)}
assert len(closure(A5, R18, "refl")) == 8
digraph(A5, R18, path=P("q18.png"))

# 20: композиция по цепочке
R20 = {(1, "a"), (1, "b"), (2, "b"), (3, "c")}
S20 = {("a", 5), ("b", 5), ("b", 6), ("c", 7)}
assert len(compose(R20, S20)) == 5
chain([[1, 2, 3, 4], ["a", "b", "c"], [5, 6, 7]], [R20, S20], names=["A", "B", "C"], path=P("q20.png"))

# 22: симметричное замыкание по матрице
R22 = {(1, 1), (1, 2), (2, 1), (1, 3), (3, 4), (4, 2), (4, 4)}
assert len(closure(A4, R22, "sym")) == 10
matrix(A4, pairs=R22, path=P("q22.png"))

# 24: транзитивное замыкание по графу
R24 = {(1, 2), (2, 1), (2, 3), (4, 3)}
assert len(closure(A4, R24, "trans")) == 7
digraph(A4, R24, path=P("q24.png"))

# 25: наименьшее n с Rⁿ = ∅
R25 = {(1, 2), (2, 3), (3, 4), (1, 5)}
Rn, n = set(R25), 1
while Rn:
    Rn, n = compose(Rn, R25), n + 1
assert n == 4
digraph(A5, R25, path=P("q25.png"))

# ключи без картинок
A9 = range(1, 10)
assert sorted(x for x in A9 if (x - 5) % 3 == 0) == [2, 5, 8]                       # 19
assert len(compose({(a, b) for a in range(3) for b in "xy"},
                   {(b, c) for b in "xy" for c in range(4)})) == 12                  # 21
subs = [frozenset(c) for r in range(3) for c in combinations([1, 2], r)]
assert sum(X <= Y for X in subs for Y in subs) == 9                                    # 23
A3 = [1, 2, 3]; allp3 = [(a, b) for a in A3 for b in A3]
assert sum(is_eq(A3, {allp3[i] for i in range(9) if m >> i & 1}) for m in range(512)) == 5   # 26
R28 = {(1, 2), (3, 2), (3, 4)}
assert len(closure(A4, closure(A4, R28, "sym"), "trans")) == 16                        # 28
assert len(closure(A4, closure(A4, R28, "trans"), "sym")) == 6
Rc = {(1, 2), (2, 3), (3, 1)}
assert compose(Rc, Rc) == inverse(Rc) and compose(compose(Rc, Rc), Rc) != Rc           # 39
assert len(closure(A3, Rc, "trans")) == 9 and len(Rc | compose(Rc, Rc)) == 6
R, S = eqrel([[1, 2], [3]]), eqrel([[1], [2, 3]])                                     # 41
assert is_eq(A3, R & S) and not is_eq(A3, R | S) and not is_eq(A3, compose(R, S))
print("Картинки нарисованы, ключи сошлись.")
