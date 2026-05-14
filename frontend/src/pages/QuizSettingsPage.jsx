import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import Dropdown from "../components/Dropdown";
import {
  getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
  addQuestion, updateQuestion, deleteQuestion, reorderQuestions,
  addOption, updateOption, deleteOption,
  getMaterials, addMaterial, deleteMaterial,
  getFiles, uploadFile, deleteFile,
  getLinks, addLink, deleteLink,
  getAssignments, createAssignment, deleteAssignment,
} from "../api/quizzes";
import { getSections, getCategories } from "../api/textbooks";
import { getUnits, getDepartments, getOrgRoles } from "../api/org";
import {
  Plus, Trash2, GripVertical, Save, ChevronDown, ChevronUp,
  BookOpen, FileText, Link2, Calendar, X, Send, Info,
} from "lucide-react";
import DatePicker from "../components/DatePicker";
import { useDialog } from "../components/DialogProvider";

function PremiumSlider({ value, min, max, step = 1, onChange, onMouseUp }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range" min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(parseInt(e.target.value))}
      onMouseUp={onMouseUp}
      onTouchEnd={onMouseUp}
      className="slider-premium flex-1"
      style={{
        background: `linear-gradient(to right, #C19A6B 0%, #C19A6B ${pct}%, var(--ui-border-strong) ${pct}%, var(--ui-border-strong) 100%)`,
      }}
    />
  );
}

export default function QuizSettingsPage() {
  const { user } = useAuth();
  const dialog = useDialog();
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [units, setUnits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getUnits();
        setUnits(res.data?.results ?? res.data ?? []);
      } catch { /* silent */ }
      await loadTemplates();
      setLoading(false);
    };
    load();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await getTemplates();
      setTemplates(res.data?.results ?? res.data ?? []);
    } catch { /* silent */ }
  };

  const loadDetail = async (id) => {
    try {
      const res = await getTemplate(id);
      setDetail(res.data);
      if (res.data.unit) {
        loadDepsAndRoles(res.data.unit, res.data.department, res.data.org_role);
      }
    } catch { toast.error("Ошибка загрузки шаблона"); }
  };

  const loadDepsAndRoles = async (unitId, currentDeptId = null, currentRoleId = null) => {
    try {
      const [dRes, rolesRes] = await Promise.all([
        getDepartments({ unit: unitId }),
        getOrgRoles({ unit: unitId }),
      ]);

      setDepartments(dRes.data?.results ?? dRes.data ?? []);

      let activeDeptId = currentDeptId;
      const depts = dRes.data?.results ?? dRes.data ?? [];
      if (depts.length === 1 && !activeDeptId) {
        activeDeptId = depts[0].id;
        updateField("department", activeDeptId);
      }

      const roleParams = activeDeptId
        ? { department: activeDeptId }
        : { unit: unitId };
      const rRes = await getOrgRoles(roleParams);
      const rolesList = rRes.data?.results ?? rRes.data ?? [];
      setRoles(rolesList);

      if (rolesList.length === 1 && !currentRoleId) {
        updateField("org_role", rolesList[0].id);
      }
    } catch { /* silent */ }
  };

  const handleUnitChange = (unitId) => {
    updateField("unit", unitId);
    updateField("department", null);
    updateField("org_role", null);
    setDepartments([]);
    setRoles([]);
    if (unitId) {
      loadDepsAndRoles(unitId);
    }
  };

  const handleDeptChange = async (deptId) => {
    const dept = deptId || null;
    updateField("department", dept);
    updateField("org_role", null);

    try {
      const params = dept
        ? { department: dept }
        : detail?.unit ? { unit: detail.unit } : {};
      const rRes = await getOrgRoles(params);
      setRoles(rRes.data?.results ?? rRes.data ?? []);
      const rolesList = rRes.data?.results ?? rRes.data ?? [];
      if (rolesList.length === 1) {
        updateField("org_role", rolesList[0].id);
      }
    } catch {
      setRoles([]);
    }
  };

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  const handleCreate = async () => {
    try {
      const unit = units[0]?.id;
      if (!unit) { toast.error("Нет доступных юнитов"); return; }
      const res = await createTemplate({ name: "Новый тест", unit, mode: "exam" });
      await loadTemplates();
      setSelectedId(res.data.id);
      toast.success("Шаблон создан");
    } catch { toast.error("Ошибка создания"); }
  };

  const handleSaveMeta = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await updateTemplate(detail.id, {
        name: detail.name,
        description: detail.description || "",
        unit: detail.unit,
        department: detail.department || null,
        org_role: detail.org_role || null,
        mode: detail.mode,
        pass_score_pct: detail.pass_score_pct,
        study_deadline_days: detail.study_deadline_days || null,
        attempt_deadline_days: detail.attempt_deadline_days || null,
        shuffle_questions: detail.shuffle_questions,
        shuffle_options: detail.shuffle_options,
      });
      await loadTemplates();
      await loadDetail(detail.id);
      toast.success("Сохранено");
    } catch { toast.error("Ошибка сохранения"); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!detail) return;
    const ok = await dialog.confirm(
      "Удалить шаблон?",
      `Шаблон «${detail.name}» и все его вопросы будут удалены. Это действие нельзя отменить.`,
      { destructive: true, confirmText: "Удалить" },
    );
    if (!ok) return;
    try {
      await deleteTemplate(detail.id);
      setDetail(null);
      setSelectedId(null);
      await loadTemplates();
      toast.success("Шаблон удалён");
    } catch { toast.error("Ошибка удаления"); }
  };

  const updateField = (field, value) => {
    setDetail(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-stack">
        <div className="hero-banner">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="page-title">Настройка тестов</h1>
              <p className="page-subtitle mt-1">Шаблоны и настройки тестирования</p>
            </div>
            <button className="btn btn-save" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />Создать тест
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          {/* Left: Template list */}
          <div className="surface-panel space-y-2 max-h-[75vh] overflow-y-auto">
            {templates.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                Нет шаблонов. Создайте первый тест.
              </p>
            )}
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-colors duration-200 ${
                  selectedId === t.id
                    ? "bg-gray-100 border border-gray-200"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {t.name}
                  </span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    t.mode === "exam"
                      ? "bg-[rgba(193,154,107,0.12)] text-[#d9bc8d] border border-[rgba(193,154,107,0.22)]"
                      : "bg-[rgba(33,128,89,0.14)] text-[#8fd1b0] border border-[rgba(33,128,89,0.22)]"
                  }`}>
                    {t.mode === "exam" ? "Экзамен" : "Обучение"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {t.unit_name} · {t.questions_count} вопр.
                </div>
              </button>
            ))}
          </div>

          {/* Right: Editor */}
          {detail ? (
            <div className="surface-panel space-y-6 max-h-[75vh] overflow-y-auto">
              <TemplateMeta
                detail={detail}
                units={units}
                departments={departments}
                roles={roles}
                onFieldChange={updateField}
                onUnitChange={handleUnitChange}
                onDeptChange={handleDeptChange}
                onSave={handleSaveMeta}
                onDelete={handleDelete}
                saving={saving}
              />
              <hr className="border-gray-200" />
              <MaterialsSection templateId={detail.id} detail={detail} onFieldChange={updateField} onReload={() => loadDetail(detail.id)} />
              <hr className="border-gray-200" />
              <QuestionsSection detail={detail} onReload={() => loadDetail(detail.id)} />
              <hr className="border-gray-200" />
              <PublicationSection templateId={detail.id} detail={detail} units={units} onFieldChange={updateField} onReload={() => loadDetail(detail.id)} />
            </div>
          ) : (
            <div className="surface-panel flex items-center justify-center min-h-[300px]">
              <p className="text-sm text-gray-500">
                Выберите шаблон из списка или создайте новый
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Template Meta Form ──────────────────────────────────

function WheelNumberInput({ value, onChange, placeholder, min = 1, max = 999 }) {
  const ref = useRef(null);
  const displayVal = value == null ? "" : String(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onFocus = () => { document.body.style.overflow = "hidden"; };
    const onBlur = () => { document.body.style.overflow = ""; };
    const onWheel = (e) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const cur = value || 0;
      const next = e.deltaY < 0 ? cur + 1 : cur - 1;
      if (next >= min && next <= max) onChange(next);
      else if (next < min) onChange(null);
    };

    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("wheel", onWheel);
      document.body.style.overflow = "";
    };
  }, [value, onChange, min, max]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      className="input-premium w-full"
      value={displayVal}
      onChange={e => {
        if (e.target.value === "") { onChange(null); return; }
        const v = parseInt(e.target.value);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
      }}
      placeholder={placeholder}
    />
  );
}

function TemplateMeta({ detail, units, departments, roles, onFieldChange, onUnitChange, onDeptChange, onSave, onDelete, saving }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-gray-700">Основные настройки</h2>
        <div className="flex gap-2">
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button className="btn btn-save btn-sm" onClick={onSave} disabled={saving}>
            {saving ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              : <><Save className="w-3.5 h-3.5 mr-1" />Сохранить</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Название</label>
          <input
            className="input-premium w-full"
            value={detail.name}
            onChange={e => onFieldChange("name", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Режим</label>
          <Dropdown
            value={detail.mode}
            onChange={v => onFieldChange("mode", v)}
            options={[
              { value: "exam", label: "Экзамен (строгий)" },
              { value: "learning", label: "Обучение (мягкий)" },
            ]}
          />
        </div>
        <Dropdown
          label="Юнит"
          value={detail.unit}
          onChange={onUnitChange}
          options={units.map(u => ({ value: u.id, label: u.name }))}
        />
        <Dropdown
          label="Департамент"
          value={detail.department || ""}
          onChange={v => onDeptChange(v || null)}
          options={[{ value: "", label: "Все" }, ...departments.map(d => ({ value: d.id, label: d.name }))]}
        />
        <Dropdown
          label="Должность"
          value={detail.org_role || ""}
          onChange={v => onFieldChange("org_role", v || null)}
          options={[{ value: "", label: "Все" }, ...roles.map(r => ({ value: r.id, label: r.title }))]}
        />
        <div>
          <label className="block text-sm text-gray-500 mb-1">Порог прохождения (%)</label>
          <div className="flex items-center gap-3">
            <PremiumSlider
              min={0} max={100}
              value={detail.pass_score_pct}
              onChange={v => onFieldChange("pass_score_pct", v)}
            />
            <div className="relative shrink-0">
              <input
                type="text" inputMode="numeric"
                className="input-premium !w-[2.8rem] text-center text-sm !px-1 !pr-3.5"
                value={detail.pass_score_pct}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, "");
                  if (raw === "") { onFieldChange("pass_score_pct", 0); return; }
                  onFieldChange("pass_score_pct", parseInt(raw));
                }}
                onBlur={() => {
                  const clamped = Math.max(0, Math.min(100, detail.pass_score_pct || 0));
                  onFieldChange("pass_score_pct", clamped);
                }}
              />
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox" className="check-premium"
            checked={detail.shuffle_questions}
            onChange={e => onFieldChange("shuffle_questions", e.target.checked)}
          />
          Перемешивать вопросы
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox" className="check-premium"
            checked={detail.shuffle_options}
            onChange={e => onFieldChange("shuffle_options", e.target.checked)}
          />
          Перемешивать варианты
        </label>
      </div>
    </div>
  );
}

// ─── Materials Section ───────────────────────────────────

function MaterialsSection({ templateId, detail, onFieldChange, onReload }) {
  const [sections, setSections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selSection, setSelSection] = useState("");
  const [selCategory, setSelCategory] = useState("");
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  useEffect(() => {
    getSections().then(r => setSections(r.data?.results ?? r.data ?? [])).catch(() => {});
  }, []);

  const handleSectionChange = async (sectionId) => {
    setSelSection(sectionId);
    setSelCategory("");
    if (sectionId) {
      try {
        const r = await getCategories({ section: sectionId });
        setCategories(r.data?.results ?? r.data ?? []);
      } catch { setCategories([]); }
    } else { setCategories([]); }
  };

  const handleAddMaterial = async () => {
    if (!selSection) return;
    try {
      await addMaterial({
        template: templateId,
        section: selSection,
        category: selCategory || null,
      });
      setSelSection("");
      setSelCategory("");
      setCategories([]);
      onReload();
      toast.success("Материал добавлен");
    } catch { toast.error("Ошибка добавления"); }
  };

  const handleRemoveMaterial = async (materialId) => {
    try {
      await deleteMaterial(materialId);
      onReload();
    } catch { toast.error("Ошибка удаления"); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", file.name);
    formData.append("template", templateId);
    try {
      await uploadFile(templateId, formData);
      onReload();
      toast.success("Файл загружен");
    } catch { toast.error("Ошибка загрузки файла"); }
    e.target.value = "";
  };

  const handleRemoveFile = async (fileId) => {
    try {
      await deleteFile(fileId);
      onReload();
    } catch { toast.error("Ошибка удаления файла"); }
  };

  const handleAddLink = async () => {
    if (!newLinkName || !newLinkUrl) return;
    try {
      await addLink({ template: templateId, name: newLinkName, url: newLinkUrl });
      setNewLinkName("");
      setNewLinkUrl("");
      onReload();
      toast.success("Ссылка добавлена");
    } catch { toast.error("Ошибка добавления ссылки"); }
  };

  const handleRemoveLink = async (linkId) => {
    try {
      await deleteLink(linkId);
      onReload();
    } catch { toast.error("Ошибка удаления ссылки"); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-semibold text-gray-700 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-gray-400" />
        Материалы для изучения
      </h2>

      {/* Description */}
      <div>
        <label className="block text-sm text-gray-500 mb-1">Описание материалов</label>
        <textarea
          className="input-premium w-full min-h-[60px] resize-y"
          value={detail.description || ""}
          onChange={e => onFieldChange("description", e.target.value)}
          placeholder="Опишите, что нужно изучить перед прохождением теста..."
        />
      </div>

      {/* Sections & categories */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Разделы учебника</span>
        {detail.materials?.map(m => (
          <div key={m.id} className="flex items-center justify-between px-3 py-2 surface-block rounded-lg">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-n-accent" />
              <span className="text-sm text-gray-700">
                {m.section_name}{m.category_name ? ` → ${m.category_name}` : ""}
              </span>
            </div>
            <button onClick={() => handleRemoveMaterial(m.id)} className="text-gray-400 hover:text-red-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="flex gap-2 items-end">
          <Dropdown
            label="Раздел"
            value={selSection}
            onChange={handleSectionChange}
            options={sections.map(s => ({ value: s.id, label: s.name }))}
            placeholder="Выберите раздел"
            className="flex-1"
          />
          <Dropdown
            label="Категория"
            value={selCategory}
            onChange={v => setSelCategory(v)}
            options={[{ value: "", label: "Весь раздел" }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
            placeholder="Весь раздел"
            disabled={!selSection}
            className="flex-1"
          />
          <button className="btn btn-surface btn-sm mb-[1px]" onClick={handleAddMaterial} disabled={!selSection}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Files */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Файлы</span>
          <label className="btn btn-ghost btn-sm cursor-pointer">
            <Plus className="w-3.5 h-3.5 mr-1" />Загрузить
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
        {detail.files?.map(f => (
          <div key={f.id} className="flex items-center justify-between px-3 py-2 surface-block rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-n-accent" />
              <span className="text-sm text-gray-700">{f.name}</span>
              <span className="text-[11px] text-gray-400">{f.file_type}</span>
            </div>
            <button onClick={() => handleRemoveFile(f.id)} className="text-gray-400 hover:text-red-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Links */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Внешние ссылки</span>
        {detail.links?.map(l => (
          <div key={l.id} className="flex items-center gap-2 px-3 py-2 surface-block rounded-lg min-w-0">
            <Link2 className="w-4 h-4 text-n-accent shrink-0" />
            <span className="text-sm text-gray-700 shrink-0">{l.name}</span>
            <span className="text-xs text-gray-400 truncate min-w-0">{l.url}</span>
            <button onClick={() => handleRemoveLink(l.id)} className="text-gray-400 hover:text-red-400 transition-colors shrink-0 ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className="input-premium min-w-0 basis-1/2 md:basis-1/4"
            placeholder="Название"
            value={newLinkName}
            onChange={e => setNewLinkName(e.target.value)}
          />
          <input
            className="input-premium min-w-0 basis-1/2 md:flex-[3]"
            placeholder="https://..."
            value={newLinkUrl}
            onChange={e => setNewLinkUrl(e.target.value)}
          />
          <button className="btn btn-surface btn-sm" onClick={handleAddLink} disabled={!newLinkName || !newLinkUrl}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Questions Section ───────────────────────────────────

function QuestionsSection({ detail, onReload }) {
  const [expanded, setExpanded] = useState(null);
  const [newText, setNewText] = useState("");

  const handleAdd = async () => {
    const t = newText.trim();
    if (!t) return;
    try {
      const res = await addQuestion({ template: detail.id, text: t, question_type: "single", timer_seconds: 30 });
      setNewText("");
      setExpanded(res.data.id);
      onReload();
    } catch { toast.error("Ошибка добавления вопроса"); }
  };

  const handleDeleteQ = async (qId) => {
    try {
      await deleteQuestion(qId);
      onReload();
    } catch { toast.error("Ошибка удаления вопроса"); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-semibold text-gray-700">
        Вопросы ({detail.questions?.length || 0})
      </h2>

      <div className="space-y-2">
        {detail.questions?.map((q, idx) => (
          <QuestionEditor
            key={q.id}
            question={q}
            index={idx}
            expanded={expanded === q.id}
            onToggle={() => setExpanded(expanded === q.id ? null : q.id)}
            onDelete={() => handleDeleteQ(q.id)}
            onReload={onReload}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-3 py-2.5">
        <span className="text-sm font-medium text-gray-400 flex-shrink-0">
          {(detail.questions?.length || 0) + 1}.
        </span>
        <input
          className="input-premium flex-1"
          placeholder="Текст вопроса"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
        />
        <button className="btn btn-ghost btn-sm flex-shrink-0" onClick={handleAdd} disabled={!newText.trim()}>
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function QuestionEditor({ question, index, expanded, onToggle, onDelete, onReload }) {
  const [text, setText] = useState(question.text);
  const [type, setType] = useState(question.question_type);
  const [timer, setTimer] = useState(question.timer_seconds);
  const [timerInput, setTimerInput] = useState(String(question.timer_seconds));

  const saveQuestion = async () => {
    try {
      await updateQuestion(question.id, { text, question_type: type, timer_seconds: timer });
      onReload();
    } catch { toast.error("Ошибка сохранения вопроса"); }
  };

  const handleTimerSlider = (val) => {
    const v = Math.max(15, Math.min(60, parseInt(val)));
    setTimer(v);
    setTimerInput(String(v));
  };

  const handleTimerInput = (val) => {
    setTimerInput(val);
    const v = parseInt(val);
    if (!isNaN(v)) setTimer(Math.max(15, Math.min(60, v)));
  };

  const clampTimerInput = () => {
    const v = parseInt(timerInput);
    const clamped = isNaN(v) ? 15 : Math.max(15, Math.min(60, v));
    setTimer(clamped);
    setTimerInput(String(clamped));
    saveQuestion();
  };

  const handleAddOption = async () => {
    try {
      await addOption({ question: question.id, text: "Вариант ответа", is_correct: false });
      onReload();
    } catch { toast.error("Ошибка"); }
  };

  const handleUpdateOption = async (optId, data) => {
    try {
      await updateOption(optId, data);
      onReload();
    } catch { toast.error("Ошибка"); }
  };

  const handleDeleteOption = async (optId) => {
    try {
      await deleteOption(optId);
      onReload();
    } catch { toast.error("Ошибка"); }
  };

  return (
    <div className="surface-block rounded-xl">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-700 flex-shrink-0">{index + 1}.</span>
        <input
          className="input-premium flex-1 text-sm"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={saveQuestion}
          onClick={e => e.stopPropagation()}
        />
        <button onClick={onDelete} className="text-gray-400 hover:text-red-400 flex-shrink-0 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-200 flex-shrink-0 p-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Dropdown
              label="Тип ответа"
              value={type}
              onChange={v => { setType(v); setTimeout(saveQuestion, 0); }}
              options={[
                { value: "single", label: "Один правильный" },
                { value: "multiple", label: "Несколько правильных" },
              ]}
            />

            <div>
              <label className="block text-sm text-gray-500 mb-1">Таймер</label>
              <div className="flex items-center gap-3">
                <PremiumSlider
                  min={15} max={60}
                  value={timer}
                  onChange={v => handleTimerSlider(v)}
                  onMouseUp={saveQuestion}
                />
                <div className="relative shrink-0">
                  <input
                    type="text" inputMode="numeric"
                    className="input-premium !w-[2.5rem] text-center text-sm !px-1"
                    value={timerInput}
                    onChange={e => handleTimerInput(e.target.value)}
                    onBlur={clampTimerInput}
                  />
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">сек</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Варианты ответа</span>
            {question.options?.map(opt => (
              <div key={opt.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateOption(opt.id, { is_correct: !opt.is_correct })}
                  className={`flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-md border text-xs font-medium transition-all ${
                    opt.is_correct
                      ? "bg-[#C19A6B]/15 border-[#C19A6B]/50 text-[#D4AB7A]"
                      : "bg-transparent border-[var(--ui-border-strong)] text-n-dim hover:border-[#4e5a72] hover:text-n-muted"
                  }`}
                >
                  {type === "single" ? (
                    <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                      opt.is_correct ? "border-[#C19A6B]" : "border-current"
                    }`}>
                      {opt.is_correct && <span className="w-1.5 h-1.5 rounded-full bg-[#C19A6B]" />}
                    </span>
                  ) : (
                    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                      opt.is_correct ? "bg-[#C19A6B] border-[#C19A6B]" : "border-current"
                    }`}>
                      {opt.is_correct && <svg className="w-2 h-2 text-[#12151B]" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                  )}
                  {opt.is_correct ? "Верно" : "Неверно"}
                </button>
                <input
                  className="input-premium flex-1 text-sm"
                  defaultValue={opt.text}
                  onBlur={e => handleUpdateOption(opt.id, { text: e.target.value })}
                />
                <button onClick={() => handleDeleteOption(opt.id)} className="text-gray-400 hover:text-red-400 p-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={handleAddOption}>
              <Plus className="w-3.5 h-3.5 mr-1" />Вариант
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WheelTimeInput({ value, onChange, max }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onFocus = () => { document.body.style.overflow = "hidden"; };
    const onBlur = () => { document.body.style.overflow = ""; };
    const onWheel = (e) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const cur = parseInt(value) || 0;
      let next = e.deltaY < 0 ? cur + 1 : cur - 1;
      if (next > max) next = 0;
      if (next < 0) next = max;
      onChange(String(next).padStart(2, "0"));
    };
    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("wheel", onWheel);
      document.body.style.overflow = "";
    };
  }, [value, onChange, max]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      className="input-premium !w-[3.5rem] text-center text-sm !px-1"
      value={value}
      onChange={e => {
        const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
        if (raw === "") { onChange("00"); return; }
        const v = parseInt(raw);
        if (v >= 0 && v <= max) onChange(String(v).padStart(2, "0"));
      }}
    />
  );
}

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Publication Section ─────────────────────────────────

function PublicationSection({ templateId, detail, units, onFieldChange, onReload }) {
  const [assignments, setAssignments] = useState([]);
  const [pubDate, setPubDate] = useState("");
  const [pubHour, setPubHour] = useState("09");
  const [pubMinute, setPubMinute] = useState("00");

  const today = toYMD(new Date());

  useEffect(() => {
    loadAssignments();
  }, [templateId]);

  const loadAssignments = async () => {
    try {
      const res = await getAssignments({ template: templateId });
      setAssignments(res.data?.results ?? res.data ?? []);
    } catch { /* silent */ }
  };

  const handlePublish = async () => {
    const studyDays = detail.study_deadline_days || null;
    const attemptDays = detail.attempt_deadline_days || null;

    let studyDeadline = null;
    let attemptDeadline = null;
    const base = pubDate ? new Date(`${pubDate}T${pubHour}:${pubMinute}:00`) : new Date();
    if (studyDays) {
      const sd = new Date(base);
      sd.setDate(sd.getDate() + studyDays);
      studyDeadline = sd.toISOString();
    }
    if (attemptDays) {
      const ad = new Date(base);
      ad.setDate(ad.getDate() + (studyDays || 0) + attemptDays);
      attemptDeadline = ad.toISOString();
    }

    try {
      await createAssignment({
        template: templateId,
        unit: detail.unit,
        department: detail.department || null,
        org_role: detail.org_role || null,
        study_deadline: studyDeadline,
        attempt_deadline: attemptDeadline,
      });
      loadAssignments();
      setPubDate("");
      toast.success("Тест опубликован");
    } catch { toast.error("Ошибка публикации"); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteAssignment(id);
      loadAssignments();
    } catch { toast.error("Ошибка удаления"); }
  };

  const formatAssignment = (a) => {
    const parts = [];
    if (a.study_deadline) parts.push(`Изучить до ${new Date(a.study_deadline).toLocaleDateString("ru-RU")}`);
    if (a.attempt_deadline) parts.push(`Сдать до ${new Date(a.attempt_deadline).toLocaleDateString("ru-RU")}`);
    return parts.join(" · ") || "Без ограничений";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-semibold text-gray-700 flex items-center gap-2">
        <Send className="w-4 h-4 text-gray-400" />
        Публикация теста
        <span className="group/tip relative">
          <button type="button" className="text-[#6B7A99] hover:text-[#C19A6B] cursor-help transition-colors duration-150 peer">
            <Info size={15} strokeWidth={1.8} />
          </button>
          <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-normal rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface-control)] px-3 py-2 text-xs font-normal leading-relaxed text-gray-400 shadow-lg opacity-0 transition-opacity duration-200 group-hover/tip:opacity-100 peer-focus:opacity-100 w-56 sm:w-64">
            Дедлайны считаются от момента публикации для текущих сотрудников и от даты регистрации для новых. Дни на прохождение начинают отсчёт после завершения периода изучения.
          </span>
        </span>
      </h2>

      {/* Days deadlines */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Дней на изучение</label>
          <WheelNumberInput
            value={detail.study_deadline_days}
            onChange={v => onFieldChange("study_deadline_days", v)}
            placeholder="Не ограничено"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Дней на прохождение</label>
          <WheelNumberInput
            value={detail.attempt_deadline_days}
            onChange={v => onFieldChange("attempt_deadline_days", v)}
            placeholder="Не ограничено"
          />
        </div>
      </div>

      {/* Publish date + time */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 min-w-0">
          <DatePicker
            label="Дата публикации"
            value={pubDate}
            onChange={setPubDate}
            placeholder="Сейчас"
            minDate={today}
          />
        </div>
        <div className="shrink-0">
          <label className="block text-sm text-gray-500 mb-1">Время</label>
          <div className="flex items-center gap-1.5">
            <WheelTimeInput value={pubHour} onChange={setPubHour} max={23} />
            <span className="text-gray-400 font-bold">:</span>
            <WheelTimeInput value={pubMinute} onChange={setPubMinute} max={59} />
          </div>
        </div>
      </div>

      <button className="btn btn-save w-full" onClick={handlePublish} disabled={!detail.unit}>
        <Send className="w-4 h-4 mr-2" />Опубликовать
      </button>

      {/* Existing assignments */}
      {assignments.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Опубликованные</span>
          {assignments.map(a => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 surface-block rounded-lg">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-gray-700">
                  {a.unit_name}
                  {a.department_name && ` · ${a.department_name}`}
                  {a.org_role_title && ` · ${a.org_role_title}`}
                </span>
                <span className="text-xs text-gray-500">{formatAssignment(a)}</span>
              </div>
              <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-400 shrink-0 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
