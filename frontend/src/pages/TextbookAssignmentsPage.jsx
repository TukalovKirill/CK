import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCards, getAssignments, createAssignment, deleteAssignment, bulkDeleteAssignments } from "../api/textbooks";
import { getEmployees } from "../api/org";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function TextbookAssignmentsPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const loadAll = async () => {
    try {
      const [c, e, a] = await Promise.all([getCards(), getEmployees(), getAssignments()]);
      setCards(c.data.results || c.data);
      setEmployees(e.data.results || e.data);
      setAssignments(a.data.results || a.data);
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useRealtimeUpdates(["textbook_assignment"], loadAll);

  const handleAssign = async () => {
    if (!selectedCard || !selectedEmployee) return;
    try {
      await createAssignment({ card: selectedCard, employee: selectedEmployee });
      setSelectedCard("");
      setSelectedEmployee("");
      toast.success("Назначено");
      loadAll();
    } catch {
      toast.error("Ошибка назначения");
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteAssignment(id);
      toast.success("Удалено");
      loadAll();
    } catch {
      toast.error("Ошибка");
    }
  };

  if (loading) return <p className="text-center py-8 text-gray-400">Загрузка...</p>;

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate("/textbooks/manage")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> К управлению
      </button>

      <h1 className="text-xl font-bold mb-4">Назначения карточек</h1>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <p className="text-sm font-medium mb-3">Новое назначение</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Карточка</label>
            <select value={selectedCard} onChange={(e) => setSelectedCard(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm">
              <option value="">Выберите карточку</option>
              {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Сотрудник</label>
            <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm">
              <option value="">Выберите сотрудника</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.user?.last_name} {e.user?.first_name}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleAssign}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 flex items-center gap-1">
            <Plus size={14} /> Назначить
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {assignments.map((a) => (
          <div key={a.id} className="bg-white rounded-lg shadow-sm p-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{a.card_name || a.card}</span>
              <span className="text-gray-400 mx-2">→</span>
              <span>{a.employee_name || a.employee}</span>
            </div>
            <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {assignments.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Нет назначений</p>
        )}
      </div>
    </div>
  );
}
