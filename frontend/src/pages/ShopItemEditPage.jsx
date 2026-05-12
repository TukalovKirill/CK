import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth, getUserUnitsForPermission } from "../context/AuthContext";
import { getItem, createItem, updateItem, getCategories } from "../api/shop";
import { getUnits } from "../api/org";
import { Save, ArrowLeft, Upload } from "lucide-react";

export default function ShopItemEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    stock_quantity: "-1",
    category: "",
    unit: "",
    is_active: true,
  });
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUnits();
    loadCategories();
    if (isEdit) loadItem();
  }, [id, user]);

  const loadUnits = async () => {
    let unitList = [];
    if (user?.permissions === null) {
      try {
        const res = await getUnits();
        unitList = res.data.map((u) => ({ id: u.id, name: u.name }));
      } catch (e) {
        console.error(e);
      }
    } else {
      const editUnits = getUserUnitsForPermission(user, "shop.edit");
      const assignments = user?.assignments || [];
      const filtered = assignments.filter(
        (a) => !editUnits || editUnits.includes(a.unit)
      );
      const mapped = filtered.map((a) => ({ id: a.unit, name: a.unit_name }));
      unitList = Array.from(new Map(mapped.map((u) => [u.id, u])).values());
    }
    setUnits(unitList);
    if (!isEdit && unitList.length > 0 && !form.unit) {
      setForm((f) => ({ ...f, unit: String(unitList[0].id) }));
    }
  };

  const loadCategories = async () => {
    try {
      const res = await getCategories();
      setCategories(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadItem = async () => {
    try {
      const res = await getItem(id);
      const item = res.data;
      setForm({
        name: item.name,
        description: item.description || "",
        price: String(item.price),
        stock_quantity: String(item.stock_quantity),
        category: item.category ? String(item.category) : "",
        unit: String(item.unit),
        is_active: item.is_active,
      });
      if (item.photo_url) setPhotoPreview(item.photo_url);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.unit) return;

    setSaving(true);
    try {
      const data = {
        name: form.name,
        description: form.description,
        price: parseInt(form.price),
        stock_quantity: parseInt(form.stock_quantity),
        unit: parseInt(form.unit),
        is_active: form.is_active,
      };
      if (form.category) data.category = parseInt(form.category);
      if (photo) data.photo = photo;

      if (isEdit) {
        await updateItem(id, data);
      } else {
        await createItem(data);
      }
      navigate("/shop/manage");
    } catch (e) {
      const detail = e.response?.data?.detail || e.response?.data?.photo?.[0] || "Ошибка при сохранении";
      alert(detail);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center" style={{ color: "var(--n-muted)" }}>Загрузка...</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate("/shop/manage")}
        className="flex items-center gap-2 mb-4 text-sm btn-ghost px-3 py-1.5 rounded-lg"
      >
        <ArrowLeft size={16} />
        Назад
      </button>

      <h1 className="text-2xl font-bold mb-6">
        {isEdit ? "Редактирование товара" : "Новый товар"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Название *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border text-sm"
            style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Описание</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border text-sm resize-none"
            style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Цена (СК коины) *</label>
            <input
              type="number"
              min="1"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border text-sm"
              style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Количество (-1 = безлимит)</label>
            <input
              type="number"
              min="-1"
              value={form.stock_quantity}
              onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border text-sm"
              style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Юнит *</label>
            <select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value, category: "" })}
              className="w-full px-4 py-2.5 rounded-lg border text-sm"
              style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
              required
            >
              <option value="">Выберите юнит</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Категория</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border text-sm"
              style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
            >
              <option value="">Без категории</option>
              {categories
                .filter((c) => !form.unit || String(c.unit) === form.unit)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Фото</label>
          <div className="flex items-center gap-4">
            {photoPreview && (
              <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-lg object-cover" />
            )}
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer text-sm hover:opacity-80" style={{ borderColor: "var(--n-border)" }}>
              <Upload size={16} />
              {photo ? photo.name : "Выбрать файл"}
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </label>
          </div>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm">Активен (виден в витрине)</span>
        </label>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-primary disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? "Сохранение..." : (isEdit ? "Сохранить" : "Создать товар")}
        </button>
      </form>
    </div>
  );
}
