r"""
dm_figures — единый стиль картинок для тренажёров по дискретной математике.

Правило: все картинки всех тестов рисуются только этим модулем. Стиль (цвета,
шрифт, толщина линий, размеры) зафиксирован ниже и от задания к заданию не
меняется. Нужен новый тип схемы — добавь функцию сюда же, собрав её из тех же
помощников (_Canvas, _arrow, _line, _node, _dot, _label, _txt), и сохрани
обновлённый файл для следующих тем.

Стиль: белый фон (в SVG прозрачный), тонкие чёрные линии, фиолетовая заливка только там, где она
несёт смысл, подписи снаружи фигур, шрифт DejaVu Sans. Он идёт вместе
с matplotlib, поэтому в любом чате картинка получится одинаковой.

Формат по расширению path: .svg или .png. Для сайта рисуй SVG (path="q14.svg"):
он векторный, с прозрачным фоном и сам перекрашивается в тёмной теме — чёрное
становится светлым, белое тёмным, фиолетовый остаётся фиолетовым (цвета DARK ниже).
PNG остаётся для Google Forms и старых тестов.

Размеры: ширина фиксирована, высота подстраивается под схему. Картинка в вопросе
показывается шириной ~740 px, картинка-вариант ответа ~260 px, поэтому пресетов
два: preset="question" и preset="option". Шрифт и линии подобраны так, чтобы
читаться с телефона.

Функции (рисующие возвращают путь к файлу):
  venn     диаграмма Эйлера–Венна: 1–3 множества или своя раскладка кругов,
           заливка по выражению, элементы внутри своих областей
  digraph  граф отношения на одном множестве: дуги, петли, взаимные пары
  matrix   матрица отношения с подписями строк и столбцов
  lattice  отношение как точки на сетке A × B
  mapping    стрелочная диаграмма между двумя множествами (отношения, функции)
  chain      стрелки через несколько множеств A → B → C (композиция отношений)
  partition  разбиение множества на классы (эквивалентность, фактор-множество)
  hasse      диаграмма Хассе: по уровням и покрытиям или прямо по порядку
  graph      граф: неориентированный или орграф, кратные рёбра, петли, веса, доли
  automaton  конечный автомат: состояния, переходы, начальное и допускающие состояния
  tree       корневое дерево: деревья, дерево Хаффмана с подписями 0/1
  table      таблица с текстом: таблица истинности, коды, список работ
  karnaugh   карта Карно на 2–4 переменные

Проверка ключей (ничего не рисуют):
  regions     какие области задаёт выражение (сверка ключа и вариантов)
  properties  свойства отношения на A: рефлексивность, симметричность, …
  inverse, compose, closure   R⁻¹, композиция, замыкания
  classes     классы эквивалентности — сразу в partition()
  truth, sdnf, sknf, zhegalkin, post   вектор значений формулы, СДНФ, СКНФ,
              полином Жегалкина, классы Поста
  graph_info, walks, mst   степени, компоненты, мосты, точки сочленения, хроматическое
              число, эйлеровость, радиус/диаметр/центр; маршруты длины k; вес остова
  huffman, hamming_encode, hamming_syndrome, accepts   код Хаффмана (и дерево для tree),
              код Хемминга, допускает ли автомат слово
  Комбинаторика — math.comb, math.perm, math.factorial из стандартной библиотеки.

Функции проверки считают по стандартным определениям. Где лекции расходятся
(порядок композиции, раскладка битов Хемминга, выбор 0/1 в Хаффмане, «путь» или
«маршрут») — это сказано в docstring функции, а ключ считается по лекции.

Картинка и ключ из одних данных:
  R = {(1, 1), (1, 2), (2, 1), (2, 2), (3, 3)}
  digraph([1, 2, 3], R, path="q20.png")
  properties([1, 2, 3], R)["транзитивность"]      # True
  partition(classes([1, 2, 3], R), path="q21.png")

Выражения пишутся как в условии, строкой с префиксом r:
  from dm_figures import venn, regions
  venn(("A", "B", "C"), shade=r"(A ∩ B) \ C", path="q14.png")
  regions(r"(A ∩ B) \ C") == regions(r"A ∩ B ∩ (U \ C)")   # True: такой «неверный» вариант на деле верен

Запуск файла целиком (python dm_figures.py) рисует эталонный лист со всеми типами.
"""

import io
import itertools
import math
import re
import unicodedata

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgba
from matplotlib.patches import ArrowStyle, Circle, Ellipse, FancyArrowPatch, Rectangle
from matplotlib.path import Path
from matplotlib.transforms import Bbox

# ---------- стиль: не менять от теста к тесту ----------
INK = "#000000"      # линии и текст
ACCENT = "#673AB7"   # фиолетовый: цвет темы Google Forms по умолчанию
FILL = "#BBA6DF"     # заливка областей: тот же фиолетовый, разбавленный белым
GRID = "#C8C8C8"     # вспомогательная сетка
FONT = "DejaVu Sans"

PRESETS = {
    "question": dict(width_in=6.4, dpi=250, font=18, small=16, lw=1.6, arrow=20),
    "option": dict(width_in=3.0, dpi=400, font=17, small=15, lw=2.1, arrow=18),
}

# Цвета SVG в тёмной теме. Светлые — константы выше. PNG тёмной темы не знает,
# сайт затемняет его фильтром; SVG перекрашивается сам, фиолетовые оттенки сохраняются.
DARK = {"ink": "#ECEBF1", "paper": "#1F1E25", "fill": "#5B4690", "accent": "#B49CF5", "grid": "#4A4755"}

plt.rcParams.update({
    "svg.hashsalt": "dm_figures",  # одинаковые картинки дают одинаковый SVG: чистые диффы в git
    "font.family": FONT,
    "mathtext.fontset": "dejavusans",
    "mathtext.default": "regular",
    "text.color": INK,
    "savefig.facecolor": "white",
})


# ---------- холст ----------
class _Overflow(Exception):
    def __init__(self, width_in):
        super().__init__(width_in)
        self.width_in = width_in


class _Canvas:
    HEIGHT_IN = 14.0

    def __init__(self, preset, unit_in):
        if preset not in PRESETS:
            raise ValueError(f"preset должен быть одним из: {', '.join(PRESETS)}")
        self.p = PRESETS[preset]
        self.unit = unit_in  # дюймов на единицу данных
        w, h = self.p["width_in"], self.HEIGHT_IN
        self.fig = plt.figure(figsize=(w, h), dpi=100)
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_axis_off()
        self.ax.set_autoscale_on(False)
        self.ax.set_xlim(-w / (2 * unit_in), w / (2 * unit_in))
        self.ax.set_ylim(-h / (2 * unit_in), h / (2 * unit_in))
        self.items = []

    def u(self, points):
        """Пункты → единицы данных."""
        return points / 72.0 / self.unit

    def add(self, artist):
        self.items.append(artist)
        return artist

    def _bbox(self):
        self.fig.canvas.draw()
        r = self.fig.canvas.get_renderer()
        return Bbox.union([a.get_window_extent(r) for a in self.items])

    def save(self, path):
        w, dpi = self.p["width_in"], self.fig.dpi
        bb = self._bbox()
        shift = ((bb.x0 + bb.x1) / 2 / dpi - w / 2) / self.unit  # центрируем по горизонтали
        x0, x1 = self.ax.get_xlim()
        self.ax.set_xlim(x0 + shift, x1 + shift)
        bb = self._bbox()
        if bb.width / dpi > w - 0.25:
            raise _Overflow(bb.width / dpi)
        pad = 0.18
        y0 = max(bb.y0 / dpi - pad, 0.0)
        y1 = min(bb.y1 / dpi + pad, self.HEIGHT_IN)
        box = Bbox([[0, y0], [w, y1]])
        if str(path).lower().endswith(".svg"):
            buf = io.StringIO()
            self.fig.savefig(buf, format="svg", bbox_inches=box, facecolor="none",
                             metadata={"Date": None, "Creator": "dm_figures"})
            with open(path, "w", encoding="utf-8") as f:
                f.write(_themed_svg(buf.getvalue()))
        else:
            self.fig.savefig(path, dpi=self.p["dpi"], bbox_inches=box, facecolor="white")
        plt.close(self.fig)
        return path


def _themed_svg(svg):
    """Цвета модуля → CSS-переменные, светлые и тёмные значения — во встроенном <style>.
    Работает и в <img>: браузер применяет prefers-color-scheme внутри SVG."""
    colors = {INK: "ink", "#FFFFFF": "paper", FILL: "fill", ACCENT: "accent", GRID: "grid"}
    light = {"ink": INK, "paper": "#FFFFFF", "fill": FILL, "accent": ACCENT, "grid": GRID}
    for hex_, name in colors.items():
        svg = re.sub(re.escape(hex_), f"var(--{name})", svg, flags=re.I)
    decl = lambda d: "; ".join(f"--{k}: {v}" for k, v in d.items())
    # fill на корне — для текста: matplotlib не пишет цвет, если он чёрный по умолчанию
    style = (f"<style>svg {{ {decl(light)}; fill: var(--ink) }} "
             f"@media (prefers-color-scheme: dark) {{ svg {{ {decl(DARK)} }} }}</style>")
    return re.sub(r"(<svg\b[^>]*>)", r"\1" + style.replace("\\", "\\\\"), svg, count=1)


def _render(draw, preset, unit_in, path):
    for _ in range(4):
        cv = _Canvas(preset, unit_in)
        draw(cv)
        try:
            return cv.save(path)
        except _Overflow as e:
            plt.close(cv.fig)
            unit_in *= (cv.p["width_in"] - 0.35) / e.width_in
    raise RuntimeError("Схема не помещается по ширине — упростите её")


# ---------- общие элементы ----------
def _nat(x):
    s = str(x)
    return (0, int(s), "") if re.fullmatch(r"-?\d+", s) else (1, 0, s)


def _txt(cv, x, y, s, size=None, **kw):
    return cv.add(cv.ax.text(x, y, s, fontsize=size or cv.p["font"], zorder=6, **kw))


def _label(cv, xy, angle_deg, text, dist, size=None, offset_pt=4):
    """Подпись снаружи фигуры: от точки xy в направлении angle_deg на расстоянии dist."""
    a = math.radians(angle_deg)
    c, s = math.cos(a), math.sin(a)
    p = (xy[0] + dist * c, xy[1] + dist * s)
    ha = "left" if c > 0.35 else "right" if c < -0.35 else "center"
    va = "bottom" if s > 0.35 else "top" if s < -0.35 else "center"
    t = cv.ax.annotate(text, xy=p, xytext=(offset_pt * c, offset_pt * s),
                       textcoords="offset points", ha=ha, va=va,
                       fontsize=size or cv.p["font"], zorder=6)
    return cv.add(t)


def _style(kind):
    if kind == "-":
        return ArrowStyle("-")
    return ArrowStyle(kind, head_length=0.46, head_width=0.2)


def _arrow(cv, p, q, kind="-|>", rad=0.0, shrink=0.0, color=INK, lw=None):
    a = FancyArrowPatch(tuple(p), tuple(q), arrowstyle=_style(kind),
                        mutation_scale=cv.p["arrow"], lw=lw or cv.p["lw"], color=color,
                        shrinkA=shrink, shrinkB=shrink, joinstyle="miter",
                        connectionstyle=f"arc3,rad={rad}", zorder=3)
    cv.ax.add_patch(a)
    return cv.add(a)


def _line(cv, p, q, color=INK, lw=None, z=2):
    (ln,) = cv.ax.plot([p[0], q[0]], [p[1], q[1]], color=color, lw=lw or cv.p["lw"],
                       solid_capstyle="butt", zorder=z)
    return cv.add(ln)


def _node(cv, xy, r, filled=False):
    c = Circle(xy, r, facecolor=FILL if filled else "white", edgecolor=INK,
               lw=cv.p["lw"], zorder=4)
    cv.ax.add_patch(c)
    return cv.add(c)


def _dot(cv, xy, r, color=INK):
    c = Circle(xy, r, facecolor=color, edgecolor=INK, lw=cv.p["lw"] * 0.6, zorder=4)
    cv.ax.add_patch(c)
    return cv.add(c)


def _check_pairs(pairs, left, right, what="пары"):
    """Каждая пара должна состоять из подписанных элементов, иначе картинка молча теряет пару."""
    bad = [p for p in pairs if p[0] not in left or p[1] not in right]
    if bad:
        raise ValueError(f"{what} с элементами не из подписанных множеств: "
                         f"{sorted(bad, key=lambda p: (_nat(p[0]), _nat(p[1])))}")


# ---------- диаграммы Эйлера–Венна ----------
_VENN = {
    1: ([(0.0, 0.0, 1.0)], [135]),
    2: ([(-0.55, 0.0, 1.0), (0.55, 0.0, 1.0)], [135, 45]),
    3: ([(-0.54, 0.31, 1.0), (0.54, 0.31, 1.0), (0.0, -0.62, 1.0)], [135, 45, 270]),
}
_OPS = [("∪", "|"), ("∩", "&"), ("∖", "&~"), ("\\", "&~"), ("Δ", "^"), ("△", "^")]


_BINOPS = {"∪": "∪", "∩": "∩", "\\": "\\", "∖": "\\", "Δ": "Δ", "△": "Δ"}


def _check_brackets(expr):
    """Разные операции на одном уровне скобок — ошибка: порядок действий неоднозначен."""
    stack = [set()]
    for ch in expr:
        if ch == "(":
            stack.append(set())
        elif ch == ")":
            if len(stack) == 1:
                raise ValueError(f"В «{expr}» лишняя закрывающая скобка")
            stack.pop()
        elif ch in _BINOPS:
            stack[-1].add(_BINOPS[ch])
            if len(stack[-1]) > 1:
                ops = " и ".join(sorted(stack[-1]))
                raise ValueError(f"В «{expr}» операции {ops} стоят без скобок — "
                                 f"порядок действий неоднозначен, расставьте скобки")
    if len(stack) != 1:
        raise ValueError(f"В «{expr}» не закрыта скобка")


def _predicate(shade, names):
    if shade is None:
        return None
    _check_brackets(shade)
    # дополнение Ā: и готовый символ, и буква с комбинирующей чертой U+0304 или U+0305
    expr = re.sub(r"(\w)[\u0304\u0305]", r"(~\1)", unicodedata.normalize("NFD", shade))
    for a, b in _OPS:
        expr = expr.replace(a, b)
    code = compile(expr, "<shade>", "eval")
    unknown = set(code.co_names) - set(names) - {"U"}
    if unknown:
        raise ValueError(f"В выражении «{shade}» неизвестные имена: {', '.join(sorted(unknown))}")
    return lambda env: eval(code, {"__builtins__": {}}, env)


def venn(names=("A", "B"), shade=None, members=None, universe=True, layout=None,
         label_angles=None, preset="question", path="venn.png"):
    r"""Диаграмма Эйлера–Венна.

    names         имена множеств, 1–3 штуки при стандартной раскладке
    shade         что закрасить — выражение как в условии: r"(A ∩ B) \ C",
                  "A Δ (B ∪ C)", "Ā ∩ B". Операции ∪ ∩ \ Δ и дополнение Ā.
                  Разные операции без скобок («A ∪ B ∩ C») — ошибка
    members       элементы по областям: {"U": range(1, 11), "A": [1, 2], "B": [2, 5]};
                  каждый элемент встанет в свою область, противоречие — ошибка
    universe      рисовать ли прямоугольник U (по умолчанию да — единообразно)
    layout        своя раскладка кругов для схем Эйлера, например вложенных:
                  {"A": (x, y, r), ...}
    label_angles  куда ставить имя множества, в градусах: {"A": 150}
    """
    names = list(names)
    if layout is None:
        if len(names) not in _VENN:
            raise ValueError("Без layout поддерживается от 1 до 3 множеств")
        circles, angs = _VENN[len(names)]
        circles = dict(zip(names, circles))
        angles = dict(zip(names, angs))
    else:
        circles = {n: tuple(map(float, layout[n])) for n in names}
        mx = np.mean([c[0] for c in circles.values()])
        my = np.mean([c[1] for c in circles.values()])
        angles = {n: 90.0 if math.hypot(x - mx, y - my) < 1e-9
                  else math.degrees(math.atan2(y - my, x - mx))
                  for n, (x, y, r) in circles.items()}
    angles.update(label_angles or {})
    pred = _predicate(shade, names)

    xs0 = min(x - r for x, y, r in circles.values())
    xs1 = max(x + r for x, y, r in circles.values())
    ys0 = min(y - r for x, y, r in circles.values())
    ys1 = max(y + r for x, y, r in circles.values())
    m = 0.5
    ubox = (xs0 - m, ys0 - m, xs1 + m, ys1 + m)
    cbox = (xs0, ys0, xs1, ys1)

    def draw(cv):
        ax = cv.ax
        bx0, by0, bx1, by1 = ubox if universe else cbox
        if pred is not None:
            # Маску обводим контуром: область получается векторной и в SVG перекрашивается.
            res = cv.unit * 220
            nx, ny = max(2, int((bx1 - bx0) * res)), max(2, int((by1 - by0) * res))
            X, Y = np.meshgrid(np.linspace(bx0, bx1, nx), np.linspace(by0, by1, ny))
            inside = {n: (X - x) ** 2 + (Y - y) ** 2 <= r * r for n, (x, y, r) in circles.items()}
            env = dict(inside, U=np.ones_like(X, dtype=bool))
            mask = np.asarray(pred(env), dtype=bool)
            if not universe:
                mask &= np.logical_or.reduce(list(inside.values()))
            if mask.any():
                ax.contourf(X, Y, mask.astype(float), levels=[0.5, 1.5], colors=[FILL],
                            antialiased=True, zorder=1)
        for n, (x, y, r) in circles.items():
            cv.add(ax.add_patch(Circle((x, y), r, fill=False, ec=INK, lw=cv.p["lw"], zorder=3)))
            _label(cv, (x, y), angles[n], n, r)
        if universe:
            cv.add(ax.add_patch(Rectangle((bx0, by0), bx1 - bx0, by1 - by0, fill=False,
                                          ec=INK, lw=cv.p["lw"], zorder=3)))
            _label(cv, (bx0, by1), 135, "U", 0)
        if members:
            _place_members(cv, names, circles, angles, members, ubox if universe else cbox, universe)

    return _render(draw, preset, 1.35, path)


def regions(expr, names=("A", "B", "C"), layout=None):
    r"""Какие области диаграммы задаёт выражение. Нужна, чтобы сверить ключ и варианты:
    ровно один вариант должен давать те же области, что и закраска на картинке.

    regions("A Δ B", "AB") == regions(r"(A \ B) ∪ (B \ A)", "AB")   # True
    Область — кортеж принадлежности: (1, 0, 1) — в A и в C, но не в B.
    layout — та же раскладка, что в venn(..., layout=...): тогда учитываются только
    области, которые на этой картинке действительно есть (важно для вложенных кругов).
    """
    names = list(names)
    pred = _predicate(expr, names)
    codes = list(itertools.product([False, True], repeat=len(names)))
    if layout is not None:
        cs = [tuple(map(float, layout[n])) for n in names]
        x0 = min(x - r for x, y, r in cs) - 0.2
        x1 = max(x + r for x, y, r in cs) + 0.2
        y0 = min(y - r for x, y, r in cs) - 0.2
        y1 = max(y + r for x, y, r in cs) + 0.2
        X, Y = np.meshgrid(np.linspace(x0, x1, 600), np.linspace(y0, y1, 600))
        ins = np.stack([(X - x) ** 2 + (Y - y) ** 2 <= r * r for x, y, r in cs], axis=-1)
        present = {tuple(map(bool, v)) for v in ins.reshape(-1, len(names))}
        codes = [c for c in codes if c in present]
    env = {n: np.array([c[i] for c in codes], dtype=bool) for i, n in enumerate(names)}
    env["U"] = np.ones(len(codes), dtype=bool)
    mask = np.asarray(pred(env), dtype=bool)
    return frozenset(tuple(int(v) for v in c) for c, m in zip(codes, mask) if m)


def _region_name(names, code):
    inside = [n for n, c in zip(names, code) if c]
    return " ∩ ".join(inside) if inside else "вне всех множеств"


def _place_members(cv, names, circles, angles, members, box, universe):
    sets = {n: set(members.get(n, ())) for n in names}
    if "U" in members:
        elems = list(members["U"])
        extra = set().union(*sets.values()) - set(elems)
        if extra:
            raise ValueError(f"Элементы {sorted(extra, key=_nat)} есть в множествах, но не в U")
    else:
        elems = list(set().union(*sets.values()))
    groups = {}
    for e in elems:
        groups.setdefault(tuple(e in sets[n] for n in names), []).append(e)

    h = cv.u(cv.p["small"])   # высота подписи элемента
    hl = cv.u(cv.p["font"])   # высота имени множества
    obst = []                 # имена множеств — тоже препятствия
    for n, (x, y, r) in circles.items():
        a = math.radians(angles[n])
        d = r + cv.u(4) + 0.55 * hl
        obst.append((x + d * math.cos(a), y + d * math.sin(a)))

    def code_at(X, Y):
        return {n: (X - x) ** 2 + (Y - y) ** 2 <= r * r for n, (x, y, r) in circles.items()}

    def clear_at(X, Y):
        c = np.full(np.shape(X), np.inf)
        for x, y, r in circles.values():
            c = np.minimum(c, np.abs(np.hypot(X - x, Y - y) - r))
        if universe:
            c = np.minimum.reduce([c, X - box[0], box[2] - X, Y - box[1], box[3] - Y])
        for ox, oy in obst:
            c = np.minimum(c, np.hypot(X - ox, Y - oy) - 0.75 * hl)
        return c

    step = h / 3
    X, Y = np.meshgrid(np.arange(box[0], box[2], step), np.arange(box[1], box[3], step))
    inside, clear = code_at(X, Y), clear_at(X, Y)
    need = 0.95 * h

    for code, els in groups.items():
        where = _region_name(names, code)
        if not any(code) and not universe:
            raise ValueError("Элементы вне всех множеств требуют universe=True")
        region = np.logical_and.reduce([inside[n] == c for n, c in zip(names, code)])
        ok = region & (clear >= need)
        if not ok.any():
            raise ValueError(f"Области «{where}» на этой схеме нет или она слишком мала")
        pts, cl = np.column_stack([X[ok], Y[ok]]), clear[ok]
        best = pts[np.argmax(cl)]

        # аккуратная раскладка: узлы решётки, как можно меньше строк, ближе к середине области
        sx, sy = 1.9 * h, 1.45 * h
        anchors = pts[:: max(1, len(pts) // 150)]
        picked, score = None, None
        I, J = np.meshgrid(np.arange(-8, 9), np.arange(-8, 9))
        for ax_, ay_ in anchors:
            LX, LY = ax_ + I * sx, ay_ + J * sy
            ins, cl2 = code_at(LX, LY), clear_at(LX, LY)
            good = np.logical_and.reduce([ins[n] == c for n, c in zip(names, code)]) & (cl2 >= need)
            if good.sum() < len(els):
                continue
            cand = np.column_stack([LX[good], LY[good]])
            d = np.hypot(cand[:, 0] - ax_, 3.0 * (cand[:, 1] - ay_))
            sel = cand[np.argsort(d)[:len(els)]]
            rows = len(np.unique(np.round(sel[:, 1] / sy)))
            s = (rows, float(np.hypot(*(sel.mean(axis=0) - best))))
            if score is None or s < score:
                picked, score = list(sel), s
        if picked is None:  # узкая область — просто разносим подписи
            picked = []
            for i in np.argsort(-cl):
                p = pts[i]
                if all(math.hypot(*(p - q)) >= 1.8 * h for q in picked):
                    picked.append(p)
                    if len(picked) == len(els):
                        break
        if len(picked) < len(els):
            raise ValueError(f"В области «{where}» не помещаются {len(els)} элементов — "
                             f"увеличьте круги или уберите часть элементов")
        picked.sort(key=lambda q: (-round(q[1] / (0.9 * h)), q[0]))
        for e, q in zip(sorted(els, key=_nat), picked):
            _txt(cv, q[0], q[1], str(e), size=cv.p["small"], ha="center", va="center")


# ---------- граф отношения ----------
def _ring(nodes):
    n = len(nodes)
    if n == 1:
        return {nodes[0]: (0.0, 0.0)}
    if n == 2:
        return {nodes[0]: (-1.0, 0.0), nodes[1]: (1.0, 0.0)}
    if n == 4:
        return dict(zip(nodes, [(-0.85, 0.85), (0.85, 0.85), (0.85, -0.85), (-0.85, -0.85)]))
    return {v: (math.cos(math.pi / 2 - 2 * math.pi * i / n),
                math.sin(math.pi / 2 - 2 * math.pi * i / n)) for i, v in enumerate(nodes)}


def _loop(cv, center, ang, rn, rl, gap, kind="-|>", color=INK, lw=None):
    c = np.array(center)
    a = math.radians(ang)
    lc = c + np.array([math.cos(a), math.sin(a)]) * (rn + 0.75 * rl)
    base = a + math.pi
    lo, hi = 0.0, math.pi
    for _ in range(60):  # где петля выходит из вершины
        mid = (lo + hi) / 2
        p = lc + rl * np.array([math.cos(base + mid), math.sin(base + mid)])
        if np.linalg.norm(p - c) < rn + gap:
            lo = mid
        else:
            hi = mid
    t = np.linspace(base + hi, base - hi + 2 * math.pi, 90)
    verts = np.column_stack([lc[0] + rl * np.cos(t), lc[1] + rl * np.sin(t)])
    arr = FancyArrowPatch(path=Path(verts), arrowstyle=_style(kind), joinstyle="miter",
                          mutation_scale=cv.p["arrow"], lw=lw or cv.p["lw"], color=color, zorder=3)
    cv.ax.add_patch(arr)
    return cv.add(arr)


def _free_angle(occupied, prefer):
    """occupied — 360 флагов «занято» по градусам; середина самого широкого свободного сектора."""
    free = ~occupied
    if free.all() or not free.any():
        return prefer % 360
    start = int(np.argmax(occupied))
    rot = np.roll(free, -start)
    runs, i = [], 0
    while i < 360:
        if rot[i]:
            j = i
            while j < 360 and rot[j]:
                j += 1
            runs.append((j - i, i))
            i = j
        else:
            i += 1
    longest = max(r[0] for r in runs)

    def mid(r):
        return (start + r[1] + r[0] / 2) % 360

    def key(r):
        d = abs((mid(r) - prefer + 180) % 360 - 180)
        return (round(d / 15), -math.sin(math.radians(mid(r))))

    return mid(min([r for r in runs if r[0] >= longest - 2], key=key))


def _occupy(occ, ang, half):
    for k in range(int(round(ang - half)), int(round(ang + half)) + 1):
        occ[k % 360] = True


def digraph(nodes, pairs, pos=None, mutual="double", highlight=(), preset="question",
            path="graph.png"):
    """Граф отношения R ⊆ A².

    nodes      элементы A в порядке обхода (по кругу по часовой стрелке от верха)
    pairs      пары отношения: {(1, 2), (2, 2), ...}; (a, a) рисуется петлёй
    pos        свои координаты вершин {v: (x, y)}, если круг не подходит
    mutual     "double" — взаимная пара одной линией с двумя стрелками,
               "arcs" — двумя дугами
    highlight  вершины с фиолетовой заливкой (только если это нужно по смыслу)
    """
    nodes = list(nodes)
    pairs = {tuple(p) for p in pairs}
    unknown = {v for p in pairs for v in p} - set(nodes)
    if unknown:
        raise ValueError(f"В парах есть элементы не из A: {sorted(unknown, key=_nat)}")
    pos = {k: (float(v[0]), float(v[1])) for k, v in (pos or _ring(nodes)).items()}
    cx = np.mean([p[0] for p in pos.values()])
    cy = np.mean([p[1] for p in pos.values()])
    rn, gap, rl = 0.075, 0.035, 0.18

    def outward(v):
        x, y = pos[v]
        return 90.0 if math.hypot(x - cx, y - cy) < 1e-9 else math.degrees(math.atan2(y - cy, x - cx))

    def draw(cv):
        shrink = (rn + gap) * cv.unit * 72
        done = set()
        for a, b in sorted(pairs, key=lambda p: (_nat(p[0]), _nat(p[1]))):
            if a == b or (a, b) in done:
                continue
            if (b, a) in pairs and mutual == "double":
                _arrow(cv, pos[a], pos[b], "<|-|>", shrink=shrink)
                done |= {(a, b), (b, a)}
            else:
                rad = 0.2 if (b, a) in pairs else 0.0
                _arrow(cv, pos[a], pos[b], "-|>", rad=rad, shrink=shrink)
                done.add((a, b))
        for v in nodes:
            occ = np.zeros(360, dtype=bool)
            for a, b in pairs:
                if a != b and v in (a, b):
                    w = b if a == v else a
                    ang = math.degrees(math.atan2(pos[w][1] - pos[v][1], pos[w][0] - pos[v][0]))
                    _occupy(occ, ang, 22)
            if (v, v) in pairs:
                la = _free_angle(occ, outward(v))
                _loop(cv, pos[v], la, rn, rl, gap)
                _occupy(occ, la + 8, 70)
            _node(cv, pos[v], rn, filled=v in highlight)
            _label(cv, pos[v], _free_angle(occ, outward(v)), str(v), rn)

    return _render(draw, preset, 1.45, path)


# ---------- матрица отношения ----------
def matrix(rows, cols=None, pairs=None, values=None, name="$M_R$", highlight=(),
           preset="question", path="matrix.png"):
    """Матрица отношения с подписями строк (первый элемент пары) и столбцов (второй).

    pairs      пары отношения — или values: готовая таблица из 0 и 1
    name       подпись в углу, mathtext: "$M_R$", "$M_{R^{-1}}$"
    highlight  клетки с заливкой: {(строка, столбец), ...} по подписям
    """
    rows = list(rows)
    cols = list(rows if cols is None else cols)
    if values is None:
        ps = {tuple(p) for p in (pairs or ())}
        _check_pairs(ps, rows, cols)
        values = [[1 if (r, c) in ps else 0 for c in cols] for r in rows]
    nr, nc = len(rows), len(cols)

    def draw(cv):
        x0, y0 = -nc / 2, -nr / 2
        for r, c in highlight:
            i, j = rows.index(r), cols.index(c)
            cell = Rectangle((x0 + j, y0 + nr - 1 - i), 1, 1, fc=FILL, ec="none", zorder=1)
            cv.add(cv.ax.add_patch(cell))
        for k in range(nc + 1):
            _line(cv, (x0 + k, y0), (x0 + k, y0 + nr))
        for k in range(nr + 1):
            _line(cv, (x0, y0 + k), (x0 + nc, y0 + k))
        for i in range(nr):
            for j in range(nc):
                _txt(cv, x0 + j + 0.5, y0 + nr - 1 - i + 0.5, str(values[i][j]),
                     ha="center", va="center")
        g = 0.18
        for j, c in enumerate(cols):
            _txt(cv, x0 + j + 0.5, y0 + nr + g, str(c), ha="center", va="bottom")
        for i, r in enumerate(rows):
            _txt(cv, x0 - g, y0 + nr - 1 - i + 0.5, str(r), ha="right", va="center")
        if name:
            _txt(cv, x0 - g, y0 + nr + g, name, ha="right", va="bottom")

    return _render(draw, preset, 0.62, path)


# ---------- точки на сетке ----------
def lattice(xs, ys, pairs, xname="A", yname="B", preset="question", path="lattice.png"):
    """Отношение R ⊆ A × B как точки на сетке: по горизонтали A, по вертикали B."""
    xs, ys = list(xs), list(ys)
    nx, ny = len(xs), len(ys)
    pairs = {tuple(p) for p in pairs}
    _check_pairs(pairs, xs, ys)

    def draw(cv):
        ox, oy = -(nx + 1) / 2, -(ny + 1) / 2
        ext = 0.7
        for i in range(1, nx + 1):
            _line(cv, (ox + i, oy), (ox + i, oy + ny + 0.35), color=GRID, lw=cv.p["lw"] * 0.8, z=1)
        for j in range(1, ny + 1):
            _line(cv, (ox, oy + j), (ox + nx + 0.35, oy + j), color=GRID, lw=cv.p["lw"] * 0.8, z=1)
        _arrow(cv, (ox, oy), (ox + nx + ext, oy))
        _arrow(cv, (ox, oy), (ox, oy + ny + ext))
        g = 0.14
        for i, a in enumerate(xs, 1):
            _txt(cv, ox + i, oy - g, str(a), ha="center", va="top")
        for j, b in enumerate(ys, 1):
            _txt(cv, ox - g, oy + j, str(b), ha="right", va="center")
        _label(cv, (ox + nx + ext, oy), -35, xname, 0.05)
        _label(cv, (ox, oy + ny + ext), 145, yname, 0.05)
        for a, b in pairs:
            _dot(cv, (ox + xs.index(a) + 1, oy + ys.index(b) + 1), 0.11, color=ACCENT)

    return _render(draw, preset, 0.8, path)


# ---------- стрелочная диаграмма ----------
def chain(sets, relations, names=None, preset="question", path="chain.png"):
    """Стрелки между несколькими множествами по очереди: A → B → C.
    Нужна для композиции отношений: и R, и S видны на одной картинке.

    sets       списки элементов: [[1, 2, 3], [4, 5], [6, 7, 8]]
    relations  пары между соседними множествами, на одну меньше, чем множеств:
               [R ⊆ A × B, S ⊆ B × C]
    names      подписи множеств, по умолчанию A, B, C, …
    """
    sets = [list(x) for x in sets]
    relations = [{tuple(p) for p in r} for r in relations]
    if len(relations) != len(sets) - 1:
        raise ValueError("Отношений должно быть на одно меньше, чем множеств")
    names = list(names or "ABCDEFG"[:len(sets)])
    for k, r in enumerate(relations):
        _check_pairs(r, sets[k], sets[k + 1], f"Пары {names[k]} × {names[k + 1]}")
    n = max(len(x) for x in sets)
    k_sets = len(sets)
    # у средних множеств подпись над точкой — нужен шаг побольше
    step, w, dx, rd = (0.62 if k_sets == 2 else 0.85), 1.45, 2.9, 0.05
    h = n * step + 0.55

    def ys(k):
        return [((k - 1) / 2 - i) * step for i in range(k)]

    cx = [(i - (k_sets - 1) / 2) * dx for i in range(k_sets)]
    pos = []
    for i, x in enumerate(sets):
        shift = 0.22 if i == 0 else -0.22 if i == k_sets - 1 else 0.0
        pos.append({v: (cx[i] + shift, y) for v, y in zip(x, ys(len(x)))})

    def draw(cv):
        for i in range(k_sets):
            cv.add(cv.ax.add_patch(Ellipse((cx[i], 0), w, h, fill=False, ec=INK,
                                           lw=cv.p["lw"], zorder=2)))
            _label(cv, (cx[i], h / 2), 90, names[i], 0.02)
            side = 180 if i == 0 else 0 if i == k_sets - 1 else 90
            for v, p in pos[i].items():
                _dot(cv, p, rd)
                _label(cv, p, side, str(v), rd)
        shrink = (rd + 0.05) * cv.unit * 72
        for i, r in enumerate(relations):
            src, dst = pos[i], pos[i + 1]
            # несколько стрелок в один элемент: концы чуть разводим, чтобы наконечники не слипались
            into = {}
            for p in r:
                into.setdefault(p[1], []).append(p[0])
            for bv, avs in into.items():
                avs.sort(key=lambda av: -src[av][1])
                spread = min(cv.u(cv.p["arrow"] * 0.5), 0.45 * step / max(len(avs) - 1, 1))
                offs = [(len(avs) - 1) / 2 * spread - j * spread for j in range(len(avs))]
                for av, off in zip(avs, offs):
                    q = (dst[bv][0], dst[bv][1] + off)
                    _arrow(cv, src[av], q, shrink=shrink)

    return _render(draw, preset, 1.05, path)


def mapping(A, B, pairs, names=("A", "B"), preset="question", path="mapping.png"):
    """Стрелки из элементов A в элементы B: отношение между множествами или функция."""
    return chain([A, B], [pairs], names=names, preset=preset, path=path)


# ---------- разбиение на классы ----------
def partition(blocks, name="A", preset="question", path="partition.png"):
    """Разбиение множества на классы: прямоугольник, разделённый на части,
    в каждой части — её элементы. Для классов эквивалентности и фактор-множества.

    blocks  классы: [[1, 4], [2, 5, 7], [3]]; пересекаться не должны, пустых нет
    name    подпись множества в углу, как U у venn
    """
    blocks = [sorted(b, key=_nat) for b in blocks]
    if any(not b for b in blocks):
        raise ValueError("Пустой класс в разбиении недопустим")
    flat = [v for b in blocks for v in b]
    if len(flat) != len(set(flat)):
        raise ValueError("Классы разбиения пересекаются")
    rows = min(3, max(len(b) for b in blocks))
    sx, sy, pad = 0.55, 0.5, 0.3
    widths = [math.ceil(len(b) / rows) * sx + 2 * pad for b in blocks]
    H = rows * sy + 2 * pad
    W = sum(widths)

    def draw(cv):
        x0, y0 = -W / 2, -H / 2
        cv.add(cv.ax.add_patch(Rectangle((x0, y0), W, H, fill=False, ec=INK,
                                         lw=cv.p["lw"], zorder=3)))
        _label(cv, (x0, y0 + H), 135, name, 0)
        x = x0
        for k, (b, wd) in enumerate(zip(blocks, widths)):
            if k:
                _line(cv, (x, y0), (x, y0 + H))
            cols = math.ceil(len(b) / rows)
            for i, v in enumerate(b):
                c, r = divmod(i, rows)
                used = min(rows, len(b) - c * rows)
                px = x + wd / 2 + (c - (cols - 1) / 2) * sx
                py = ((used - 1) / 2 - r) * sy
                _txt(cv, px, py, str(v), ha="center", va="center")
            x += wd

    return _render(draw, preset, 1.1, path)


# ---------- диаграмма Хассе ----------
def hasse(levels=None, covers=None, order=None, elements=None, preset="question",
          path="hasse.png"):
    """Диаграмма Хассе. Два способа задать:

    levels, covers    вручную: уровни снизу вверх [[1], [2, 3], [6]] и пары покрытия
                      (меньший, больший)
    order, elements   сам порядок: множество пар (a, b) «a ≤ b» или функция
                      order(a, b) -> bool на elements. Модуль проверит, что это частичный
                      порядок, сам найдёт покрытия и уровни — картинка и ключ из одних данных:
                      hasse(order=lambda a, b: b % a == 0, elements=[1, 2, 3, 4, 6, 12])
    Если рёбра пересекаются, передайте levels вместе с order: уровни и порядок внутри
    уровня возьмутся из levels.
    """
    if order is not None:
        if callable(order):
            if elements is None:
                raise ValueError("Для order-функции нужен elements")
            els = list(elements)
            le = {(a, b) for a in els for b in els if order(a, b)}
        else:
            le = {tuple(p) for p in order}
            els = list(elements) if elements is not None else sorted(
                {v for p in le for v in p}, key=_nat)
            _check_pairs(le, els, els)
        p = properties(els, le)
        missing = [k for k in ("рефлексивность", "антисимметричность", "транзитивность") if not p[k]]
        if missing:
            raise ValueError(f"Это не частичный порядок: нет свойств {', '.join(missing)}")
        lt = {(a, b) for a, b in le if a != b}
        covers = {(a, b) for a, b in lt
                  if not any((a, c) in lt and (c, b) in lt for c in els)}
        if levels is None:
            rank = {}
            for v in sorted(els, key=lambda v: sum((u, v) in lt for u in els)):
                below = [u for u in els if (u, v) in covers]
                rank[v] = 1 + max((rank[u] for u in below), default=-1)
            levels = [sorted([v for v in els if rank[v] == i], key=_nat)
                      for i in range(max(rank.values()) + 1)]
    if levels is None or covers is None:
        raise ValueError("Передайте levels и covers или order")
    pos = {}
    for i, level in enumerate(levels):
        k = len(level)
        for j, v in enumerate(level):
            pos[v] = ((j - (k - 1) / 2) * 1.25, i * 1.1)
    _check_pairs(covers, pos, pos, "Покрытия")
    my = np.mean([p[1] for p in pos.values()])
    pos = {v: (x, y - my) for v, (x, y) in pos.items()}
    rn = 0.075

    def draw(cv):
        for a, b in covers:
            pa, pb = np.array(pos[a]), np.array(pos[b])
            u = (pb - pa) / np.linalg.norm(pb - pa)
            _line(cv, pa + u * rn, pb - u * rn)
        for v, p in pos.items():
            _node(cv, p, rn)
            _label(cv, p, 0, str(v), rn)

    return _render(draw, preset, 1.2, path)


# ---------- проверка ключей для отношений ----------
def inverse(R):
    """R⁻¹ = {(b, a) : (a, b) ∈ R}."""
    return {(b, a) for a, b in R}


def compose(first, second):
    """Пары (a, c), для которых есть b: (a, b) ∈ first и (b, c) ∈ second.
    Сначала применяется first, потом second. Как это записывается — R∘S или S∘R —
    зависит от соглашения лекции: сверь на шаге 1 и держи одинаково во всём тесте."""
    return {(a, c) for a, b in first for b2, c in second if b == b2}


def properties(A, R):
    """Свойства отношения R на A — для сверки ключа. Определения стандартные:
    рефлексивность          ∀a ∈ A: aRa
    антирефлексивность      ∀a ∈ A: ¬aRa
    симметричность          ∀a, b ∈ A: (aRb ⇒ bRa)
    антисимметричность      ∀a, b ∈ A: (aRb ∧ bRa ⇒ a = b)
    асимметричность         ∀a, b ∈ A: (aRb ⇒ ¬bRa)
    транзитивность          ∀a, b, c ∈ A: (aRb ∧ bRc ⇒ aRc)
    полнота                 ∀a, b ∈ A: (aRb ∨ bRa)
    Если в лекции определение другое (например, полнота только для a ≠ b) —
    ключ считается по лекции, а не по этой функции.
    """
    A = list(A)
    R = {tuple(p) for p in R}
    _check_pairs(R, A, A)
    return {
        "рефлексивность": all((a, a) in R for a in A),
        "антирефлексивность": all((a, a) not in R for a in A),
        "симметричность": all((b, a) in R for a, b in R),
        "антисимметричность": all(a == b for a, b in R if (b, a) in R),
        "асимметричность": all((b, a) not in R for a, b in R),
        "транзитивность": all((a, d) in R for a, b in R for c, d in R if b == c),
        "полнота": all((a, b) in R or (b, a) in R for a in A for b in A),
    }


def closure(A, R, kind):
    """Замыкание R на A: kind — "refl", "sym" или "trans"."""
    R = {tuple(p) for p in R}
    if kind == "refl":
        return R | {(a, a) for a in A}
    if kind == "sym":
        return R | inverse(R)
    if kind == "trans":
        while True:
            nxt = R | compose(R, R)
            if nxt == R:
                return R
            R = nxt
    raise ValueError('kind должен быть "refl", "sym" или "trans"')


def classes(A, R):
    """Классы эквивалентности R на A — готовые blocks для partition().
    Если R не эквивалентность, скажет, какого свойства не хватает."""
    A = list(A)
    p = properties(A, R)
    missing = [k for k in ("рефлексивность", "симметричность", "транзитивность") if not p[k]]
    if missing:
        raise ValueError(f"Это не эквивалентность: нет свойств {', '.join(missing)}")
    R = {tuple(q) for q in R}
    out, seen = [], set()
    for a in sorted(A, key=_nat):
        if a not in seen:
            cls = sorted([b for b in A if (a, b) in R], key=_nat)
            seen |= set(cls)
            out.append(cls)
    return out


# ---------- графы ----------
def _fmt(x):
    """Число для подписи: без хвостов вида 0.30000000000000004."""
    if isinstance(x, float):
        return f"{round(x, 10):g}"
    return str(x)


def _draw_network(cv, nodes, pos, edges, directed, rn, gap, rl, inside=False,
                  accept=(), start=None, hl_edges=(), hl_nodes=(), small_labels=False):
    """Общая отрисовка графа и автомата. edges — список (a, b, подпись или None)."""
    cx = np.mean([p[0] for p in pos.values()])
    cy = np.mean([p[1] for p in pos.values()])
    occ = {v: np.zeros(360, dtype=bool) for v in nodes}
    shrink = (rn + gap) * cv.unit * 72
    kind = "-|>" if directed else "-"
    lsize = cv.p["small"] if small_labels else None

    def outward(v):
        x, y = pos[v]
        return 90.0 if math.hypot(x - cx, y - cy) < 1e-9 else math.degrees(math.atan2(y - cy, x - cx))

    def look(i):
        return (ACCENT, cv.p["lw"] * 1.9) if i in hl_edges else (INK, cv.p["lw"])

    groups, loops = {}, {}
    for i, (a, b, _) in enumerate(edges):
        if a == b:
            loops.setdefault(a, []).append(i)
        else:
            u, v = sorted((a, b), key=_nat)
            groups.setdefault((u, v), []).append(i)

    for (u, v), idx in groups.items():
        k = len(idx)
        for j, i in enumerate(idx):
            a, b, text = edges[i]
            off = (j - (k - 1) / 2) * 0.32
            r = off if (a, b) == (u, v) else -off
            pa, pb = np.array(pos[a]), np.array(pos[b])
            d = pb - pa
            color, lw = look(i)
            _arrow(cv, pa, pb, kind, rad=r, shrink=shrink, color=color, lw=lw)
            normal = np.array([d[1], -d[0]]) / np.linalg.norm(d)
            mid = (pa + pb) / 2 + 0.5 * r * np.array([d[1], -d[0]])
            for w in (a, b):
                t = mid - np.array(pos[w])
                _occupy(occ[w], math.degrees(math.atan2(t[1], t[0])), 22)
            if text is not None:
                side = normal if r >= 0 else -normal
                _label(cv, mid, math.degrees(math.atan2(side[1], side[0])), str(text), 0.0,
                       size=lsize, offset_pt=3)

    for v, idx in loops.items():
        for i in idx:
            la = _free_angle(occ[v], outward(v))
            color, lw = look(i)
            _loop(cv, pos[v], la, rn, rl, gap, kind=kind, color=color, lw=lw)
            _occupy(occ[v], la + (8 if directed else 0), 70)
            text = edges[i][2]
            if text is not None:
                a = math.radians(la)
                tip = np.array(pos[v]) + np.array([math.cos(a), math.sin(a)]) * (rn + 1.75 * rl)
                _label(cv, tip, la, str(text), 0.0, size=lsize, offset_pt=3)

    if start is not None:
        sa = _free_angle(occ[start], 180)
        a = math.radians(sa)
        dirv = np.array([math.cos(a), math.sin(a)])
        p0 = np.array(pos[start]) + dirv * (rn + 0.42)
        _arrow(cv, p0, np.array(pos[start]) + dirv * (rn + gap * 0.3))
        _occupy(occ[start], sa, 25)

    for v in nodes:
        _node(cv, pos[v], rn, filled=v in hl_nodes)
        if v in accept:
            ring = Circle(pos[v], rn * 0.8, fill=False, edgecolor=INK, lw=cv.p["lw"], zorder=5)
            cv.add(cv.ax.add_patch(ring))
        if inside:
            _txt(cv, pos[v][0], pos[v][1], str(v), size=cv.p["small"], ha="center", va="center")
        else:
            _label(cv, pos[v], _free_angle(occ[v], outward(v)), str(v), rn)


def _columns(parts, dx=1.6, dy=0.75):
    pos = {}
    for i, part in enumerate(parts):
        k = len(part)
        for j, v in enumerate(part):
            pos[v] = ((i - (len(parts) - 1) / 2) * dx, ((k - 1) / 2 - j) * dy)
    return pos


def graph(nodes, edges, directed=False, weights=None, pos=None, parts=None,
          highlight=(), highlight_nodes=(), preset="question", path="graph.png"):
    """Граф из теории графов: неориентированный или ориентированный, с кратными рёбрами,
    петлями и весами. Для отношений на множестве остаётся digraph.

    edges       список пар; повтор пары — кратное ребро, (v, v) — петля
    directed    True — дуги со стрелками
    weights     веса в том же порядке, что edges (для сетевого графика — длительности работ)
    pos         свои координаты {v: (x, y)}; по умолчанию вершины по кругу
    parts       доли для двудольного графа: [[1, 2, 3], [4, 5]] — столбцами
    highlight   рёбра с фиолетовой линией — только для вариантов-картинок
                («на какой картинке остов»), в вопросе выдают ответ
    """
    nodes = list(nodes)
    edges = [tuple(e) for e in edges]
    _check_pairs(edges, nodes, nodes, "Рёбра")
    if weights is not None and len(weights) != len(edges):
        raise ValueError("weights должен быть той же длины, что edges")
    if pos is None:
        pos = _columns(parts) if parts else _ring(nodes)
    pos = {k: (float(v[0]), float(v[1])) for k, v in pos.items()}
    hl = {tuple(e) for e in highlight}
    hl_idx = {i for i, (a, b) in enumerate(edges)
              if (a, b) in hl or (not directed and (b, a) in hl)}
    items = [(a, b, None if weights is None else _fmt(weights[i])) for i, (a, b) in enumerate(edges)]

    def draw(cv):
        _draw_network(cv, nodes, pos, items, directed, 0.075, 0.035, 0.18,
                      hl_edges=hl_idx, hl_nodes=set(highlight_nodes))

    return _render(draw, preset, 1.45, path)


# ---------- конечные автоматы ----------
def automaton(states, transitions, start, accept=(), pos=None, preset="question",
              path="automaton.png"):
    """Диаграмма конечного автомата (ДКА, НКА, Мили, Мура).

    states       состояния по порядку: ["q0", "q1", "q2"]
    transitions  [(откуда, куда, подпись)]: ("q0", "q1", "a"), ("q1", "q1", "a, b"),
                 для Мили — "a/0". Одинаковые (откуда, куда) склеиваются в одну подпись
    start        начальное состояние — входящая стрелка
    accept       допускающие состояния — двойной круг
    Имена состояний здесь внутри кругов, как принято для автоматов: снаружи
    их путали бы с подписями переходов.
    """
    states = list(states)
    merged = {}
    for p, q, t in transitions:
        merged.setdefault((p, q), []).append(str(t))
    _check_pairs(merged, states, states, "Переходы")
    if start not in states or not set(accept) <= set(states):
        raise ValueError("start и accept должны быть из states")
    items = [(p, q, ", ".join(ts)) for (p, q), ts in merged.items()]
    if pos is None:
        # по кругу, а не в линию: в линию обратные переходы проходят сквозь состояния
        pos = _ring(states)
    pos = {k: (float(v[0]), float(v[1])) for k, v in pos.items()}

    def draw(cv):
        _draw_network(cv, states, pos, items, True, 0.19, 0.02, 0.17, inside=True,
                      accept=set(accept), start=start, small_labels=True)

    return _render(draw, preset, 1.3, path)


# ---------- деревья ----------
def tree(children, root, labels=None, edge_labels=None, preset="question", path="tree.png"):
    """Корневое дерево сверху вниз: деревья из теории графов, дерево Хаффмана.

    children     {вершина: [дети слева направо]}; листья можно не перечислять
    labels       подписи вершин {v: "a: 0.4"}; нет в словаре — подпись str(v), "" — без подписи
    edge_labels  подписи рёбер {(родитель, ребёнок): "0"}
    """
    children = {k: list(v) for k, v in children.items()}
    labels = labels or {}
    edge_labels = edge_labels or {}
    order, depth, x = [], {}, {}
    counter = [0]

    def walk(v, d, seen):
        if v in seen:
            raise ValueError("В children есть цикл — это не дерево")
        seen.add(v)
        depth[v] = d
        order.append(v)
        kids = children.get(v, [])
        for c in kids:
            walk(c, d + 1, seen)
        if kids:
            x[v] = (x[kids[0]] + x[kids[-1]]) / 2
        else:
            x[v] = counter[0]
            counter[0] += 1

    walk(root, 0, set())
    extra = set(children) - set(order)
    if extra:
        raise ValueError(f"Вершины не достижимы из корня: {sorted(extra, key=_nat)}")
    sx, sy = 0.75, 0.85
    mx = (counter[0] - 1) / 2
    pos = {v: ((x[v] - mx) * sx, -depth[v] * sy) for v in order}
    rn = 0.06

    def draw(cv):
        occ = {v: np.zeros(360, dtype=bool) for v in order}
        for p in order:
            for c in children.get(p, []):
                pa, pb = np.array(pos[p]), np.array(pos[c])
                u = (pb - pa) / np.linalg.norm(pb - pa)
                _line(cv, pa + u * rn, pb - u * rn)
                ang = math.degrees(math.atan2(u[1], u[0]))
                _occupy(occ[p], ang, 25)
                _occupy(occ[c], ang + 180, 25)
                if (p, c) in edge_labels:
                    side = 180 if pb[0] < pa[0] - 1e-9 else 0
                    _label(cv, (pa + pb) / 2, side, str(edge_labels[(p, c)]), 0.0,
                           size=cv.p["small"], offset_pt=5)
        for v in order:
            _node(cv, pos[v], rn)
            text = labels.get(v, str(v))
            if text:
                prefer = -90 if not children.get(v) else 90
                _label(cv, pos[v], _free_angle(occ[v], prefer), text, rn, size=cv.p["small"])

    return _render(draw, preset, 1.2, path)


# ---------- таблицы ----------
def table(header, rows, highlight=(), preset="question", path="table.png"):
    """Таблица с текстом в клетках: таблица истинности, коды символов, список работ.
    Google Forms таблиц не показывает, поэтому таблица — картинкой.

    header     заголовки столбцов: ["x", "y", "f"]
    rows       строки: [[0, 0, 1], [0, 1, 0], ...]
    highlight  клетки с заливкой {(строка, столбец)}, нумерация с 0 без заголовка
    """
    header = [str(h) for h in header]
    rows = [[_fmt(c) for c in r] for r in rows]
    if any(len(r) != len(header) for r in rows):
        raise ValueError("В каждой строке столько же клеток, сколько заголовков")
    nr = len(rows) + 1

    def draw(cv):
        ch = cv.u(cv.p["font"]) * 0.62
        widths = [max(len(t) for t in [h] + [r[j] for r in rows]) * ch + 0.32
                  for j, h in enumerate(header)]
        widths = [max(w, 0.55) for w in widths]
        rh = 0.5
        W, H = sum(widths), nr * rh
        x0, y0 = -W / 2, -H / 2
        xs = [x0 + sum(widths[:j]) for j in range(len(widths) + 1)]
        for i, j in highlight:
            cell = Rectangle((xs[j], y0 + H - (i + 2) * rh), widths[j], rh, fc=FILL, ec="none", zorder=1)
            cv.add(cv.ax.add_patch(cell))
        for xk in xs:
            _line(cv, (xk, y0), (xk, y0 + H))
        for k in range(nr + 1):
            lw = cv.p["lw"] * (2 if k == nr - 1 else 1)
            _line(cv, (x0, y0 + k * rh), (x0 + W, y0 + k * rh), lw=lw)
        for i, r in enumerate([header] + rows):
            for j, t in enumerate(r):
                _txt(cv, xs[j] + widths[j] / 2, y0 + H - (i + 0.5) * rh, t, ha="center", va="center")

    return _render(draw, preset, 0.9, path)


# ---------- карты Карно ----------
def _gray(k):
    return [format(i ^ (i >> 1), f"0{k}b") for i in range(2 ** k)]


def karnaugh(variables, values, highlight=(), preset="question", path="karnaugh.png"):
    """Карта Карно на 2–4 переменные. Строки — первая половина переменных, столбцы — вторая,
    порядок кодов — код Грея.

    variables  ["x", "y", "z", "w"]
    values     вектор значений в стандартном порядке (000…0, 000…1, …), строка "01101001"
               или список; "-" — неопределённое значение
    highlight  клетки с заливкой — номера наборов (индексы в векторе);
               для вариантов «какую область покрывает импликанта»
    """
    variables = [str(v) for v in variables]
    n = len(variables)
    if not 2 <= n <= 4:
        raise ValueError("Карта Карно здесь на 2–4 переменные")
    values = [str(v) for v in values]
    if len(values) != 2 ** n:
        raise ValueError(f"Нужно {2 ** n} значений, передано {len(values)}")
    kr = n // 2
    kc = n - kr
    rcodes, ccodes = _gray(kr), _gray(kc)

    def draw(cv):
        nr, nc = len(rcodes), len(ccodes)
        c0 = 1.25
        x0, y0 = -(nc + c0) / 2, -(nr + 1) / 2
        gx, gy = x0 + c0, y0  # левый нижний угол области значений
        for xk in [x0] + [gx + k for k in range(nc + 1)]:
            _line(cv, (xk, gy), (xk, gy + nr + 1))
        for k in range(nr + 2):
            _line(cv, (x0, gy + k), (gx + nc, gy + k))
        _line(cv, (x0, gy + nr + 1), (gx, gy + nr))  # диагональ угловой клетки
        s = cv.p["small"]
        _txt(cv, gx - 0.08, gy + nr + 0.92, "".join(variables[kr:]), size=s, ha="right", va="top")
        _txt(cv, x0 + 0.08, gy + nr + 0.08, "".join(variables[:kr]), size=s, ha="left", va="bottom")
        for j, c in enumerate(ccodes):
            _txt(cv, gx + j + 0.5, gy + nr + 0.5, c, ha="center", va="center")
        for i, r in enumerate(rcodes):
            yy = gy + nr - 1 - i
            _txt(cv, x0 + c0 / 2, yy + 0.5, r, ha="center", va="center")
            for j, c in enumerate(ccodes):
                idx = int(r + c, 2)
                if idx in highlight:
                    cell = Rectangle((gx + j, yy), 1, 1, fc=FILL, ec="none", zorder=1)
                    cv.add(cv.ax.add_patch(cell))
                _txt(cv, gx + j + 0.5, yy + 0.5, values[idx], ha="center", va="center")

    return _render(draw, preset, 0.62, path)


# ---------- проверка ключей: булевы функции ----------
_SUB = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
_BOOL_TOKEN = re.compile(r"\s*(?:([A-Za-z][0-9₀-₉]*)([\u0304\u0305]?)|([01])|(.))")
_L1 = {"→", "↔", "≡", "↑", "↓"}
_L2 = {"∨", "⊕"}


def _bool_parse(expr):
    """Разбор формулы в функцию env -> 0/1. ¬ сильнее ∧, ∧ сильнее ∨ и ⊕.
    ∨ и ⊕ вместе без скобок, а также →, ↔, ↑, ↓ рядом с другими операциями — ошибка."""
    text = unicodedata.normalize("NFD", expr)
    toks = []
    for m in _BOOL_TOKEN.finditer(text):
        var, bar, const, other = m.groups()
        if var:
            toks.append(("var", var, bool(bar)))
        elif const:
            toks.append(("const", int(const), False))
        elif other and other.strip():
            if other in "\u0304\u0305" and toks and toks[-1][1] == ")":
                toks.append(("op", "bar", False))
            else:
                toks.append(("op", {"&": "∧", "·": "∧", "!": "¬", "~": "¬"}.get(other, other), False))
    names = []
    i = [0]

    def peek():
        return toks[i[0]][1] if i[0] < len(toks) and toks[i[0]][0] == "op" else None

    def err(msg):
        raise ValueError(f"В «{expr}»: {msg}")

    def primary():
        if i[0] >= len(toks):
            err("формула обрывается")
        kind, val, bar = toks[i[0]]
        i[0] += 1
        if kind == "var":
            if val not in names:
                names.append(val)
            f = lambda env, v=val: env[v]
        elif kind == "const":
            f = lambda env, c=val: c
        elif val == "(":
            f = p1()
            if peek() != ")":
                err("не закрыта скобка")
            i[0] += 1
            if peek() == "bar":
                i[0] += 1
                g = f
                f = lambda env: 1 - g(env)
            return f
        else:
            err(f"неожиданный символ «{val}»")
        if bar:
            g = f
            f = lambda env: 1 - g(env)
        if i[0] < len(toks) and toks[i[0]][0] in ("var", "const"):
            err("между операндами нет операции — конъюнкцию пишите через ∧")
        return f

    def p4():
        if peek() == "¬":
            i[0] += 1
            g = p4()
            return lambda env: 1 - g(env)
        return primary()

    def p3():
        f = p4()
        while peek() == "∧":
            i[0] += 1
            g, h = f, p4()
            f = lambda env, g=g, h=h: g(env) & h(env)
        return f

    def p2():
        f, op = p3(), None
        while peek() in _L2:
            o = peek()
            if op and o != op:
                err("∨ и ⊕ без скобок — порядок неоднозначен")
            op = o
            i[0] += 1
            g, h = f, p3()
            f = (lambda env, g=g, h=h: g(env) | h(env)) if o == "∨" else \
                (lambda env, g=g, h=h: g(env) ^ h(env))
        return f

    ops = {"→": lambda a, b: (1 - a) | b, "↔": lambda a, b: int(a == b), "≡": lambda a, b: int(a == b),
           "↑": lambda a, b: 1 - (a & b), "↓": lambda a, b: 1 - (a | b)}

    def p1():
        f = p2()
        if peek() in _L1:
            o = peek()
            i[0] += 1
            g, h = f, p2()
            f = lambda env, g=g, h=h, op=ops[o]: op(g(env), h(env))
            if peek() in _L1 or peek() in _L2 or peek() == "∧":
                err(f"после «{o}» нужна скобка — порядок неоднозначен")
        return f

    f = p1()
    if i[0] != len(toks):
        err(f"лишнее «{toks[i[0]][1]}»")
    return f, names


def _var_key(v):
    m = re.fullmatch(r"([A-Za-z])(\d*)", v.translate(_SUB))
    return (m.group(1), int(m.group(2) or 0))


def truth(expr, variables=None):
    """Вектор значений формулы в стандартном порядке наборов: 00…0, 00…1, …, 11…1,
    первая переменная — старший разряд. Операции: ¬ (или черта: x̄), ∧, ∨, ⊕, →, ↔ (≡),
    ↑ (штрих Шеффера), ↓ (стрелка Пирса), константы 0 и 1.
    Переменная — одна буква с номером: x, y, x1, x₂. «xy» без ∧ — ошибка.
    variables  порядок переменных; по умолчанию по алфавиту и номеру. Можно указать
               лишние переменные — функция от них не зависит, но вектор будет нужной длины.

    truth("x → y")                   # (1, 1, 0, 1)
    truth("¬x ∧ y ∨ x ∧ ¬y") == truth("x ⊕ y")   # True
    """
    f, names = _bool_parse(expr)
    variables = list(variables) if variables else sorted(names, key=_var_key)
    missing = set(names) - set(variables)
    if missing:
        raise ValueError(f"Переменных {sorted(missing)} нет в variables")
    out = []
    for bits in itertools.product([0, 1], repeat=len(variables)):
        out.append(f(dict(zip(variables, bits))))
    return tuple(out)


def _vec(values):
    v = [int(c) for c in values if str(c) in "01"]
    n = int(round(math.log2(len(v)))) if v else -1
    if not v or 2 ** n != len(v):
        raise ValueError("Длина вектора значений должна быть степенью двойки")
    return v, n


def sdnf(values, variables, neg="¬", conj=" ∧ "):
    """СДНФ по вектору значений. neg и conj — как в лекции (например neg="", черта в тексте
    не набирается надёжно — поэтому по умолчанию ¬)."""
    v, n = _vec(values)
    terms = []
    for i, b in enumerate(v):
        if b:
            bits = format(i, f"0{n}b")
            terms.append("(" + conj.join(x if c == "1" else neg + x
                                         for x, c in zip(variables, bits)) + ")")
    return " ∨ ".join(terms) if terms else "0 (СДНФ не существует)"


def sknf(values, variables, neg="¬"):
    """СКНФ по вектору значений: скобка на каждый нулевой набор, переменная с отрицанием,
    если в наборе она равна 1."""
    v, n = _vec(values)
    terms = []
    for i, b in enumerate(v):
        if not b:
            bits = format(i, f"0{n}b")
            terms.append("(" + " ∨ ".join(neg + x if c == "1" else x
                                          for x, c in zip(variables, bits)) + ")")
    return " ∧ ".join(terms) if terms else "1 (СКНФ не существует)"


def _mobius(v, n):
    a = list(v)
    for k in range(n):
        bit = 1 << k
        for m in range(len(a)):
            if m & bit:
                a[m] ^= a[m ^ bit]
    return a


def zhegalkin(values, variables, conj=""):
    """Полином Жегалкина по вектору значений. Мономы по возрастанию степени,
    свободный член первым: "1 ⊕ x ⊕ yz". conj — знак между переменными монома."""
    v, n = _vec(values)
    a = _mobius(v, n)
    monos = []
    for m, c in enumerate(a):
        if c:
            bits = format(m, f"0{n}b")
            vs = [x for x, b in zip(variables, bits) if b == "1"]
            monos.append((len(vs), bits[::-1], conj.join(vs) if vs else "1"))
    monos.sort(key=lambda t: (t[0], t[1]))
    return " ⊕ ".join(t[2] for t in monos) if monos else "0"


def post(values):
    """Принадлежность функции замкнутым классам Поста: T0, T1, S, M, L."""
    v, n = _vec(values)
    N = len(v)
    a = _mobius(v, n)
    return {
        "T0": v[0] == 0,
        "T1": v[-1] == 1,
        "S": all(v[i] != v[N - 1 - i] for i in range(N)),
        "M": all(v[i] <= v[j] for i in range(N) for j in range(N) if i & j == i),
        "L": all(c == 0 or bin(m).count("1") <= 1 for m, c in enumerate(a)),
    }


# ---------- проверка ключей: графы ----------
def graph_info(nodes, edges, directed=False):
    """Характеристики графа для сверки ключа. Кратные рёбра и петли учитываются.

    Неориентированный: степени (петля даёт 2), компоненты, мосты (индексы в edges),
    точки сочленения, двудольность, хроматическое число, эйлеровость, гамильтонов цикл
    (перебором, до 9 вершин), эксцентриситеты, радиус, диаметр, центр (для связного).
    Ориентированный: полустепени захода и исхода, компоненты слабой и сильной связности.
    """
    nodes = list(nodes)
    edges = [tuple(e) for e in edges]
    _check_pairs(edges, nodes, nodes, "Рёбра")

    def comps(vs, es):
        parent = {v: v for v in vs}

        def find(v):
            while parent[v] != v:
                parent[v] = parent[parent[v]]
                v = parent[v]
            return v
        for a, b in es:
            parent[find(a)] = find(b)
        out = {}
        for v in vs:
            out.setdefault(find(v), []).append(v)
        return sorted((sorted(c, key=_nat) for c in out.values()), key=lambda c: _nat(c[0]))

    info = {}
    if directed:
        info["полустепень исхода"] = {v: sum(a == v for a, b in edges) for v in nodes}
        info["полустепень захода"] = {v: sum(b == v for a, b in edges) for v in nodes}
        info["компоненты слабой связности"] = comps(nodes, edges)
        reach = {}
        for v in nodes:
            seen, stack = {v}, [v]
            while stack:
                x = stack.pop()
                for a, b in edges:
                    if a == x and b not in seen:
                        seen.add(b)
                        stack.append(b)
            reach[v] = seen
        strong, done = [], set()
        for v in nodes:
            if v not in done:
                c = sorted([w for w in nodes if w in reach[v] and v in reach[w]], key=_nat)
                done |= set(c)
                strong.append(c)
        info["компоненты сильной связности"] = strong
        return info

    deg = {v: sum((a == v) + (b == v) for a, b in edges) for v in nodes}
    info["степени"] = deg
    base = comps(nodes, edges)
    info["компоненты"] = base
    info["мосты"] = [i for i, (a, b) in enumerate(edges) if a != b and
                     len(comps(nodes, edges[:i] + edges[i + 1:])) > len(base)]
    info["точки сочленения"] = [v for v in nodes if len(comps(
        [w for w in nodes if w != v], [e for e in edges if v not in e])) > len(base) - (
        1 if any(c == [v] for c in base) else 0)]
    adj = {v: set() for v in nodes}
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    loops = any(a == b for a, b in edges)
    color = {}
    bip = not loops
    for s in nodes:
        if s in color:
            continue
        color[s], stack = 0, [s]
        while stack and bip:
            x = stack.pop()
            for y in adj[x]:
                if y not in color:
                    color[y] = 1 - color[x]
                    stack.append(y)
                elif color[y] == color[x]:
                    bip = False
    info["двудольный"] = bip

    def colorable(k):
        cols = {}

        def go(i):
            if i == len(nodes):
                return True
            v = nodes[i]
            for c in range(k):
                if all(cols.get(w) != c for w in adj[v]):
                    cols[v] = c
                    if go(i + 1):
                        return True
                    del cols[v]
            return False
        return go(0)
    info["хроматическое число"] = None if loops else next(
        k for k in range(1, len(nodes) + 1) if colorable(k))

    with_edges = [c for c in base if any(a in c for a, b in edges)]
    odd = [v for v in nodes if deg[v] % 2]
    one = len(with_edges) <= 1
    info["эйлеров цикл"] = bool(edges) and one and not odd
    info["эйлеров путь (не цикл)"] = bool(edges) and one and len(odd) == 2
    if len(nodes) <= 9 and len(nodes) >= 3:
        simple = {frozenset(e) for e in edges if e[0] != e[1]}
        first = nodes[0]
        info["гамильтонов цикл"] = any(
            all(frozenset((c[k], c[(k + 1) % len(c)])) in simple for k in range(len(c)))
            for c in ([first] + list(p) for p in itertools.permutations(nodes[1:])))
    if len(base) == 1:
        ecc = {}
        for s in nodes:
            dist, queue = {s: 0}, [s]
            for x in queue:
                for y in adj[x]:
                    if y not in dist:
                        dist[y] = dist[x] + 1
                        queue.append(y)
            ecc[s] = max(dist.values())
        info["эксцентриситеты"] = ecc
        info["радиус"] = min(ecc.values())
        info["диаметр"] = max(ecc.values())
        info["центр"] = [v for v in nodes if ecc[v] == info["радиус"]]
    return info


def walks(nodes, edges, k, directed=True):
    """Число маршрутов длины k между всеми парами: степень матрицы смежности.
    Кратные рёбра учитываются. Возвращает {(a, b): число}. Как называется «маршрут»
    (путь, маршрут, цепь) — по лекции."""
    nodes = list(nodes)
    idx = {v: i for i, v in enumerate(nodes)}
    M = np.zeros((len(nodes), len(nodes)), dtype=object)
    for a, b in edges:
        M[idx[a], idx[b]] += 1
        if not directed and a != b:
            M[idx[b], idx[a]] += 1
    P = np.identity(len(nodes), dtype=object)
    for _ in range(k):
        P = P.dot(M)
    return {(a, b): int(P[idx[a], idx[b]]) for a in nodes for b in nodes}


def mst(nodes, edges, weights):
    """Минимальное остовное дерево (Краскал): (вес, индексы рёбер).
    Вес минимального остова единственный, а само дерево при равных весах — нет:
    в ключ ставьте вес, а не набор рёбер."""
    parent = {v: v for v in nodes}

    def find(v):
        while parent[v] != v:
            v = parent[v]
        return v
    total, chosen = 0, []
    for i in sorted(range(len(edges)), key=lambda i: weights[i]):
        a, b = edges[i]
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            total += weights[i]
            chosen.append(i)
    return total, chosen


# ---------- проверка ключей: кодирование и автоматы ----------
def huffman(freqs):
    """Код Хаффмана. freqs — {символ: частота или вероятность}.
    Возвращает словарь: codes, avg (средняя длина кодового слова), а также children,
    root, labels, edge_labels — готовые аргументы для tree(), чтобы нарисовать
    дерево из тех же данных: tree(**{k: h[k] for k in ("children", "root", "labels", "edge_labels")}).
    При равных частотах коды не единственны — в ключ ставьте среднюю длину или длины
    кодов, а не сами слова; если спрашиваете слова, зафиксируйте в условии правило
    выбора (например: «меньшая вершина получает 0»). Здесь 0 — меньшей по весу вершине,
    при равенстве — созданной раньше."""
    items = [(p, k, ("leaf", s)) for k, (s, p) in enumerate(freqs.items())]
    total = sum(freqs.values())
    counter = len(items)
    children, labels, edge_labels = {}, {}, {}
    for p, k, (_, s) in items:
        labels[s] = f"{s}: {_fmt(p)}"
    nodes = [(p, k, s) for p, k, (_, s) in items]
    while len(nodes) > 1:
        nodes.sort(key=lambda t: (t[0], t[1]))
        (p0, k0, a), (p1, k1, b) = nodes[0], nodes[1]
        name = f"#{counter}"
        children[name] = [a, b]
        edge_labels[(name, a)] = "0"
        edge_labels[(name, b)] = "1"
        labels[name] = _fmt(round(p0 + p1, 10) if isinstance(p0 + p1, float) else p0 + p1)
        nodes = nodes[2:] + [(p0 + p1, counter, name)]
        counter += 1
    root = nodes[0][2]
    codes = {}

    def walk(v, code):
        if v in children:
            for bit, c in zip("01", children[v]):
                walk(c, code + bit)
        else:
            codes[v] = code or "0"
    walk(root, "")
    avg = sum(freqs[s] * len(c) for s, c in codes.items()) / total
    return dict(codes=codes, avg=round(avg, 10), children=children, root=root,
                labels=labels, edge_labels=edge_labels)


def hamming_encode(data):
    """Код Хемминга: контрольные биты на позициях 1, 2, 4, 8, … (нумерация с 1),
    чётность. data — строка бит. Если в лекции другая раскладка битов — ключ по лекции."""
    data = [int(c) for c in data]
    code, j, pos = [], 0, 1
    while j < len(data):
        if pos & (pos - 1) == 0:
            code.append(0)
        else:
            code.append(data[j])
            j += 1
        pos += 1
    for p in range(len(code)):
        q = p + 1
        if q & (q - 1) == 0:
            code[p] = sum(code[k] for k in range(len(code)) if (k + 1) & q and k != p) % 2
    return "".join(map(str, code))


def hamming_syndrome(code):
    """Позиция ошибочного бита (с 1) по синдрому; 0 — ошибки нет."""
    bits = [int(c) for c in code]
    s = 0
    for k, b in enumerate(bits, 1):
        if b:
            s ^= k
    return s


def accepts(transitions, start, accept, word):
    """Допускает ли автомат слово. transitions — как в automaton(): [(p, q, "a, b")].
    Работает и для НКА; ε-переходы — подпись "ε"."""
    delta = {}
    for p, q, t in transitions:
        for sym in str(t).split(","):
            delta.setdefault((p, sym.strip()), set()).add(q)

    def eps(states):
        states, stack = set(states), list(states)
        while stack:
            x = stack.pop()
            for y in delta.get((x, "ε"), ()):
                if y not in states:
                    states.add(y)
                    stack.append(y)
        return states
    cur = eps({start})
    for ch in word:
        cur = eps({q for s in cur for q in delta.get((s, ch), ())})
    return bool(cur & set(accept))


# ---------- эталонный лист ----------
def _reference_sheet(out="reference_sheet.png", tmp="."):
    import os
    from PIL import Image, ImageDraw, ImageFont
    from matplotlib import font_manager

    rel = {(1, 1), (1, 2), (2, 1), (2, 3), (3, 3), (3, 4), (4, 1)}
    hf = huffman({"a": 0.4, "b": 0.2, "c": 0.2, "d": 0.1, "e": 0.1})
    q = [
        ("venn: закрашено A \\ B",
         venn(("A", "B"), shade="A \\ B", path=f"{tmp}/ex1.png")),
        ("venn: закрашено (A ∩ B) \\ C",
         venn(("A", "B", "C"), shade="(A ∩ B) \\ C", path=f"{tmp}/ex2.png")),
        ("venn: элементы по областям, U = {1, …, 10}",
         venn(("A", "B"), members={"U": range(1, 11), "A": [1, 2, 3, 4, 5], "B": [4, 5, 6, 7]},
              path=f"{tmp}/ex3.png")),
        ("venn(layout=…): вложенные круги, закрашено (C \\ B) ∪ A",
         venn(("A", "B", "C"), shade="(C \\ B) ∪ A",
              layout={"C": (0, 0, 1.35), "B": (-0.28, -0.1, 0.85), "A": (-0.45, -0.22, 0.38)},
              label_angles={"C": 40, "B": 115, "A": 150}, path=f"{tmp}/ex4.png")),
        ("digraph: петли, взаимная пара, дуги",
         digraph([1, 2, 3, 4], rel, path=f"{tmp}/ex5.png")),
        ("matrix: то же отношение",
         matrix([1, 2, 3, 4], pairs=rel, path=f"{tmp}/ex6.png")),
        ("lattice: R ⊆ A × B точками на сетке",
         lattice([1, 2, 3, 4], ["a", "b", "c"], [(1, "a"), (2, "c"), (3, "b"), (4, "c")],
                 path=f"{tmp}/ex7.png")),
        ("mapping: функция A → B",
         mapping([1, 2, 3, 4], ["a", "b", "c"], [(1, "a"), (2, "a"), (3, "c"), (4, "b")],
                 path=f"{tmp}/ex8.png")),
        ("hasse(order=…): делимость на {1, 2, 3, 4, 6, 12}",
         hasse(order=lambda a, b: b % a == 0, elements=[1, 2, 3, 4, 6, 12],
               path=f"{tmp}/ex9.png")),
        ("partition: классы эквивалентности",
         partition(classes(range(1, 9), {(a, b) for a in range(1, 9) for b in range(1, 9)
                                          if a % 3 == b % 3}), path=f"{tmp}/ex10.png")),
        ("chain: R ⊆ A × B и S ⊆ B × C для композиции",
         chain([[1, 2, 3], [4, 5], [6, 7, 8]],
               [{(1, 4), (2, 4), (3, 5)}, {(4, 6), (4, 7), (5, 8)}], path=f"{tmp}/ex11.png")),
        ("graph: мультиграф с петлёй",
         graph([1, 2, 3, 4, 5], [(1, 2), (2, 3), (3, 1), (3, 4), (4, 5), (4, 5), (5, 5)],
               path=f"{tmp}/ex12.png")),
        ("automaton: ДКА",
         automaton(["q0", "q1", "q2"], [("q0", "q1", "a"), ("q1", "q1", "a"), ("q1", "q2", "b"),
                                        ("q2", "q0", "a, b"), ("q0", "q0", "b")],
                   start="q0", accept=["q2"], path=f"{tmp}/ex13.png")),
        ("tree(**huffman(…)): дерево Хаффмана",
         tree(**{k: hf[k] for k in ("children", "root", "labels", "edge_labels")},
              path=f"{tmp}/ex14.png")),
        ("karnaugh: 4 переменные",
         karnaugh(["x", "y", "z", "w"], truth("(x ⊕ y) ⊕ (z ⊕ w)"), path=f"{tmp}/ex15.png")),
        ("table: таблица истинности (x ∧ y) ∨ z",
         table(["x", "y", "z", "f"], [list(b) + [f] for b, f in zip(
             itertools.product([0, 1], repeat=3), truth("(x ∧ y) ∨ z"))], path=f"{tmp}/ex16.png")),
    ]
    opts = [venn(("A", "B", "C"), shade=e, preset="option", path=f"{tmp}/opt{i}.png")
            for i, e in enumerate(["A Δ (B ∪ C)", "(A ∪ B ∪ C) \\ (A ∩ B ∩ C)",
                                   "A Δ B Δ C", "(B ∪ C) \\ A"])]

    font_path = font_manager.findfont(FONT)
    f_cap = ImageFont.truetype(font_path, 22)
    f_head = ImageFont.truetype(font_path, 26)
    QW, OW, M, GAP, CAP = 740, 260, 40, 46, 40

    def fit(p, width):
        im = Image.open(p).convert("RGB")
        return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)

    qi = [(c, fit(p, QW)) for c, p in q]
    oi = [fit(p, OW) for p in opts]
    rows = [qi[i:i + 2] for i in range(0, len(qi), 2)]
    head_h = 90
    H = head_h + sum(max(im.height for _, im in r) + CAP + GAP for r in rows)
    H += CAP + max(im.height for im in oi) + 40 + M
    W = 2 * QW + 3 * M
    sheet = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(sheet)
    d.text((M, 30), "Эталон стиля dm_figures: вопрос — 740 px, варианты ответа — 260 px, "
                    "как в Google Forms", font=f_head, fill="#222222")
    y = head_h
    for r in rows:
        for k, (cap, im) in enumerate(r):
            x = M + k * (QW + M)
            d.text((x, y), cap, font=f_cap, fill="#444444")
            sheet.paste(im, (x, y + CAP))
        y += max(im.height for _, im in r) + CAP + GAP
    d.text((M, y), "preset=\"option\": какая диаграмма соответствует A Δ (B ∪ C)?",
           font=f_cap, fill="#444444")
    y += CAP
    for k, im in enumerate(oi):
        x = M + k * (OW + 50)
        sheet.paste(im, (x, y))
        d.text((x + OW // 2 - 8, y + im.height + 6), "АБВГ"[k], font=f_cap, fill="#222222")
    sheet.save(out)
    for _, p in q:
        os.remove(p)
    for p in opts:
        os.remove(p)
    return out


if __name__ == "__main__":
    print(_reference_sheet())
