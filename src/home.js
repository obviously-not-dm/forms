// Статус теста на главной: из localStorage этого браузера.
for (const a of document.querySelectorAll(".tests a")) {
  const status = a.querySelector(".t-status");
  try {
    const history = JSON.parse(localStorage.getItem(`trainer:history:${a.dataset.id}`)) || [];
    const current = JSON.parse(localStorage.getItem(`trainer:${a.dataset.id}`));
    const last = history.at(-1);
    if (current?.startedAt && !current.finished) {
      const done = Object.values(current.answers || {})
        .filter((v) => (Array.isArray(v) ? v.length : v !== null && String(v).trim() !== "")).length;
      status.textContent = `в процессе, ${done} из ${a.dataset.count}`;
    } else if (last) {
      status.textContent = `последний раз ${last.score} из ${last.max}`;
      status.classList.add("done");
    }
  } catch {}
}
