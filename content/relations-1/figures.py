# Картинки теста «Бинарные отношения, часть 1». Запуск из этой папки: python3 figures.py
import sys
sys.path.insert(0, "../../figures")
from dm_figures import digraph, matrix, lattice

A3 = [1, 2, 3]

digraph([1, 2, 3, 4], {(1, 1), (2, 2), (3, 3), (4, 4), (1, 2), (2, 3), (4, 1)}, path="q14.svg")

M = {(1, 1), (1, 2), (2, 3), (3, 3)}
matrix(A3, pairs=M, path="q15.svg")
inverse = {(b, a) for a, b in M}
complement = {(a, b) for a in A3 for b in A3} - M
square = {(a, c) for a, b in M for b2, c in M if b == b2}  # R∘R: «возвести матрицу в квадрат»
for letter, pairs in zip("АБВГ", [M, complement, inverse, square]):
    matrix(A3, pairs=pairs, name="", preset="option", path=f"q15_{letter}.svg")

digraph(["a", "b", "c", "d"], {("a", "b"), ("b", "c"), ("b", "d"), ("a", "d")}, path="q16.svg")
digraph(A3, {(1, 2), (2, 1), (2, 3), (3, 3)}, path="q29.svg")
matrix(A3, pairs={(1, 2), (3, 1), (3, 3)}, path="q30.svg")
lattice(A3, A3, {(1, 2), (3, 2), (2, 1)}, path="q31.svg")
digraph(A3, {(1, 1), (2, 2), (3, 3), (1, 2), (2, 1), (2, 3), (1, 3)}, path="q42.svg")
digraph(A3, {(1, 2), (2, 3)}, path="q43.svg")
digraph(A3, {(1, 2), (2, 3), (3, 3)}, path="q44.svg")
matrix(A3, pairs={(1, 1), (2, 2), (3, 3), (1, 3), (3, 1)}, path="q45.svg")
