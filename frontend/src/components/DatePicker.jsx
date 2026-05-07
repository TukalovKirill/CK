import { useState, useRef, useEffect } from "react";

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ymdToDisplay(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

function displayToYmd(display) {
  const clean = display.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  const d = clean.slice(0, 2);
  const m = clean.slice(2, 4);
  const y = clean.slice(4, 8);
  const num = new Date(`${y}-${m}-${d}`);
  if (isNaN(num.getTime())) return null;
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default function DatePicker({ label, value, onChange, placeholder, disabled, minDate }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => ymdToDisplay(value));
  const [viewYear, setViewYear] = useState(() => (value ? parseInt(value.split("-")[0], 10) : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (value ? parseInt(value.split("-")[1], 10) - 1 : new Date().getMonth()));
  const [view, setView] = useState("days");
  const [yearRangeStart, setYearRangeStart] = useState(() => {
    const y = value ? parseInt(value.split("-")[0], 10) : new Date().getFullYear();
    return Math.floor(y / 20) * 20;
  });

  const ref = useRef(null);
  const inputRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    setDraft(ymdToDisplay(value));
  }, [value]);

  useEffect(() => {
    if (value) {
      const [y, m] = value.split("-");
      setViewYear(parseInt(y, 10));
      setViewMonth(parseInt(m, 10) - 1);
    }
  }, [value]);

  useEffect(() => {
    if (open) setView("days");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (popupRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open || !popupRef.current) return;
    requestAnimationFrame(() => {
      const rect = popupRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (rect.bottom > window.innerHeight) {
        popupRef.current.style.top = "auto";
        popupRef.current.style.bottom = "100%";
        popupRef.current.style.marginTop = "0";
        popupRef.current.style.marginBottom = "4px";
      }
      if (rect.right > window.innerWidth) {
        popupRef.current.style.left = "auto";
        popupRef.current.style.right = "0";
      }
      if (rect.left < 0) {
        popupRef.current.style.left = "0";
        popupRef.current.style.right = "auto";
      }
    });
  }, [open]);

  const handleInput = (e) => {
    let digits = e.target.value.replace(/\D/g, "");
    if (digits.length > 8) digits = digits.slice(0, 8);

    let formatted = "";
    for (let i = 0; i < digits.length; i += 1) {
      if (i === 2 || i === 4) formatted += ".";
      formatted += digits[i];
    }

    setDraft(formatted);

    if (digits.length === 8) {
      const ymd = displayToYmd(formatted);
      if (ymd && !isBeforeMin(ymd)) {
        onChange(ymd);
        setOpen(false);
      }
    }
  };

  const handleBlur = () => {
    if (!draft) return;
    const ymd = displayToYmd(draft);
    if (ymd) onChange(ymd);
    else setDraft(ymdToDisplay(value));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const ymd = displayToYmd(draft);
      if (ymd) {
        onChange(ymd);
        setOpen(false);
      }
    }
    if (e.key === "Escape") setOpen(false);
  };

  const isBeforeMin = (ymd) => minDate && ymd < minDate;

  const selectDate = (ymd) => {
    if (isBeforeMin(ymd)) return;
    onChange(ymd);
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const weeks = [];
  const cur = new Date(firstDay);
  cur.setDate(cur.getDate() - startOffset);

  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(cur);
      const ymd = toYMD(d);
      week.push({
        date: d,
        ymd,
        inMonth: d.getMonth() === viewMonth,
        isSelected: ymd === value,
        isToday: ymd === toYMD(new Date()),
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur.getMonth() !== viewMonth && cur.getDay() === 1) break;
  }

  const monthLabel = firstDay.toLocaleString("ru-RU", { month: "long", year: "numeric" });

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {label && <label className="mb-1 block text-sm text-gray-500 dark:text-[#9AA5B8]">{label}</label>}

      <div
        className={`flex min-h-[42px] w-full items-center overflow-hidden rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface-control)] text-[var(--ui-text-primary)] transition-colors ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-text hover:border-[#4e5a72] focus-within:border-[#5e6980] focus-within:shadow-[0_0_0_3px_var(--ui-focus-ring)]"
        }`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          placeholder={placeholder || "дд.мм.гггг"}
          value={draft}
          onChange={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          onFocus={() => { if (!disabled) setOpen(true); }}
          className="min-w-0 flex-1 bg-transparent py-2 pl-3 pr-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-n-fg dark:placeholder:text-[#7B8598]"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-gray-700 dark:text-[#D2B78E] dark:hover:text-[#E8CCA0]"
        >
          <CalendarIcon />
        </button>
      </div>

      {open && (
          <div
            ref={popupRef}
            className="absolute left-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-4 shadow-lg dark:border-[#394255] dark:bg-[#151A23]"
          >
            {view === "days" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" onClick={prevMonth} className="btn-surface h-8 w-8 px-0">‹</button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearRangeStart(Math.floor(viewYear / 20) * 20);
                      setView("months");
                    }}
                    className="text-sm font-semibold capitalize text-gray-800 transition-colors hover:text-[#B48A5A] dark:text-n-fg dark:hover:text-[#D2B78E]"
                  >
                    {monthLabel}
                  </button>
                  <button type="button" onClick={nextMonth} className="btn-surface h-8 w-8 px-0">›</button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((wd) => (
                    <div key={wd} className="py-1 text-center text-xs font-semibold text-gray-500 dark:text-[#9AA5B8]">
                      {wd}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {weeks.map((week, wi) =>
                    week.map(({ ymd, inMonth, isSelected, isToday, date: d }) => {
                      const blocked = isBeforeMin(ymd);
                      return (
                        <button
                          key={`${wi}-${ymd}`}
                          type="button"
                          disabled={blocked}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectDate(ymd)}
                          className={`flex aspect-square w-full items-center justify-center rounded-lg text-xs font-medium transition-all ${
                            blocked
                              ? "cursor-not-allowed text-gray-300 dark:text-[#3F4858] line-through"
                              : !inMonth
                                ? "cursor-default text-gray-300 dark:text-[#5F6878]"
                                : isSelected
                                  ? "bg-[#232C3A] text-[#E8CCA0]"
                                  : isToday
                                    ? "border border-[#B48A5A] text-[#D2B78E] hover:bg-[#202734]"
                                    : "text-gray-800 hover:bg-gray-100 dark:text-n-fg dark:hover:bg-[#202734]"
                          }`}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {view === "months" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" onClick={() => setViewYear((y) => y - 1)} className="btn-surface h-8 w-8 px-0">‹</button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearRangeStart(Math.floor(viewYear / 20) * 20);
                      setView("years");
                    }}
                    className="text-sm font-semibold text-gray-800 transition-colors hover:text-[#B48A5A] dark:text-n-fg dark:hover:text-[#D2B78E]"
                  >
                    {viewYear}
                  </button>
                  <button type="button" onClick={() => setViewYear((y) => y + 1)} className="btn-surface h-8 w-8 px-0">›</button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {MONTHS_SHORT.map((m, i) => {
                    const sel = value && parseInt(value.split("-")[0], 10) === viewYear && parseInt(value.split("-")[1], 10) - 1 === i;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setViewMonth(i); setView("days"); }}
                        className={`rounded-lg py-2 text-sm font-medium transition-all ${
                          sel
                            ? "bg-[#232C3A] text-[#E8CCA0]"
                            : "text-gray-800 hover:bg-gray-100 dark:text-n-fg dark:hover:bg-[#202734]"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {view === "years" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" onClick={() => setYearRangeStart((s) => s - 20)} className="btn-surface h-8 w-8 px-0">‹</button>
                  <div className="text-sm font-semibold text-gray-800 dark:text-n-fg">
                    {yearRangeStart}–{yearRangeStart + 19}
                  </div>
                  <button type="button" onClick={() => setYearRangeStart((s) => s + 20)} className="btn-surface h-8 w-8 px-0">›</button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 20 }, (_, i) => yearRangeStart + i).map((y) => {
                    const sel = value && parseInt(value.split("-")[0], 10) === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => { setViewYear(y); setView("months"); }}
                        className={`rounded-lg py-2 text-xs font-medium transition-all ${
                          sel
                            ? "bg-[#232C3A] text-[#E8CCA0]"
                            : "text-gray-800 hover:bg-gray-100 dark:text-n-fg dark:hover:bg-[#202734]"
                        }`}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
      )}
    </div>
  );
}
