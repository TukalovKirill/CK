import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Профиль</h1>
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Email</span>
          <span>{user.email}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Роль</span>
          <span>{user.role === "owner" ? "Владелец" : "Сотрудник"}</span>
        </div>
        {user.org_role_title && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Должность</span>
            <span>{user.org_role_title}</span>
          </div>
        )}
        {user.assignments?.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-sm text-gray-500 mb-2">Назначения</p>
            <div className="space-y-1">
              {user.assignments.map((a) => (
                <div key={a.id} className="text-sm bg-gray-50 rounded px-3 py-1.5">
                  {a.unit_name}
                  {a.department_name && ` / ${a.department_name}`}
                  {" — "}
                  <span className="font-medium">{a.org_role_title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
