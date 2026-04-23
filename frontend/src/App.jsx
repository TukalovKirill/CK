import { Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import RequirePermission from "./components/RequirePermission";
import PublicOnly from "./components/PublicOnly";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import ProfilePage from "./pages/ProfilePage";
import TeamPage from "./pages/TeamPage";
import OrgStructurePage from "./pages/OrgStructurePage";
import TextbooksPage from "./pages/TextbooksPage";
import TextbookCardPage from "./pages/TextbookCardPage";
import TextbookManagePage from "./pages/TextbookManagePage";
import TextbookCardEditPage from "./pages/TextbookCardEditPage";
import TextbookAssignmentsPage from "./pages/TextbookAssignmentsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/org" element={<OrgStructurePage />} />
          <Route path="/textbooks" element={<RequirePermission code="textbooks.view"><TextbooksPage /></RequirePermission>} />
          <Route path="/textbooks/card/:id" element={<RequirePermission code="textbooks.view"><TextbookCardPage /></RequirePermission>} />
          <Route path="/textbooks/manage" element={<RequirePermission code="textbooks.edit"><TextbookManagePage /></RequirePermission>} />
          <Route path="/textbooks/manage/card/new" element={<RequirePermission code="textbooks.edit"><TextbookCardEditPage /></RequirePermission>} />
          <Route path="/textbooks/manage/card/:id/edit" element={<RequirePermission code="textbooks.edit"><TextbookCardEditPage /></RequirePermission>} />
          <Route path="/textbooks/assignments" element={<RequirePermission code="textbooks.manage_assignments"><TextbookAssignmentsPage /></RequirePermission>} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/profile" replace />} />
    </Routes>
  );
}
