# Картинки теста «Теория множеств». Запуск из этой папки: python3 figures.py
import sys
sys.path.insert(0, "../../figures")
from dm_figures import venn

venn(("A", "B"), shade=r"B \ A", path="q14.svg")
venn(("A", "B"), shade="A Δ B", path="q15.svg")
venn(("A", "B", "C"), shade=r"(A ∩ B) \ C", path="q16.svg")
venn(("A", "B", "C"), shade="((A ∩ B) ∪ (B ∩ C)) ∪ (A ∩ C)", path="q42.svg")
venn(("A", "B", "C"), shade="(A Δ B) Δ C", path="q43.svg")
venn(("A", "B", "C"), shade=r"(C \ B) ∪ A", universe=True,
     layout={"C": (0, 0, 1.35), "B": (-0.28, -0.1, 0.85), "A": (-0.45, -0.22, 0.38)}, path="q46.svg")
for letter, expr in zip("АБВГ", ["A Δ (B ∪ C)", r"(A ∪ B ∪ C) \ (A ∩ B ∩ C)",
                                 "(A Δ B) Δ C", r"(B ∪ C) \ A"]):
    venn(("A", "B", "C"), shade=expr, preset="option", path=f"q47_{letter}.svg")
