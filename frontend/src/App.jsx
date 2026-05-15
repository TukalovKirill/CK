import { Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import RequirePermission from "./components/RequirePermission";
import PublicOnly from "./components/PublicOnly";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import ProfilePage from "./pages/ProfilePage";
import TeamPage from "./pages/TeamPage";
import CompanySettingsPage from "./pages/CompanySettingsPage";
import ZonesPage from "./pages/ZonesPage";
import TextbooksPage from "./pages/TextbooksPage";
import TextbookCardPage from "./pages/TextbookCardPage";
import TextbookManagePage from "./pages/TextbookManagePage";
import TextbookCardEditPage from "./pages/TextbookCardEditPage";
import TextbookAssignmentsPage from "./pages/TextbookAssignmentsPage";
import QuizListPage from "./pages/QuizListPage";
import QuizDetailPage from "./pages/QuizDetailPage";
import QuizTakePage from "./pages/QuizTakePage";
import QuizResultPage from "./pages/QuizResultPage";
import QuizResultsPage from "./pages/QuizResultsPage";
import QuizSettingsPage from "./pages/QuizSettingsPage";
import ShopPage from "./pages/ShopPage";
import ShopHistoryPage from "./pages/ShopHistoryPage";
import ShopManagePage from "./pages/ShopManagePage";
import ShopItemEditPage from "./pages/ShopItemEditPage";
import ShopCoinsPage from "./pages/ShopCoinsPage";
import ShopOrdersPage from "./pages/ShopOrdersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/team" element={<RequirePermission code="team.view"><TeamPage /></RequirePermission>} />
          <Route path="/company-settings" element={<RequirePermission code="org.view"><CompanySettingsPage /></RequirePermission>} />
          <Route path="/zones" element={<RequirePermission code="org.view"><ZonesPage /></RequirePermission>} />
          <Route path="/textbooks" element={<RequirePermission code="textbooks.view"><TextbooksPage /></RequirePermission>} />
          <Route path="/textbooks/card/:id" element={<RequirePermission code="textbooks.view"><TextbookCardPage /></RequirePermission>} />
          <Route path="/textbooks/manage" element={<RequirePermission code="textbooks.edit"><TextbookManagePage /></RequirePermission>} />
          <Route path="/textbooks/manage/card/new" element={<RequirePermission code="textbooks.edit"><TextbookCardEditPage /></RequirePermission>} />
          <Route path="/textbooks/manage/card/:id/edit" element={<RequirePermission code="textbooks.edit"><TextbookCardEditPage /></RequirePermission>} />
          <Route path="/textbooks/assignments" element={<RequirePermission code="textbooks.manage_assignments"><TextbookAssignmentsPage /></RequirePermission>} />
          <Route path="/quizzes" element={<RequirePermission code="quizzes.take"><QuizListPage /></RequirePermission>} />
          <Route path="/quizzes/:assignmentId" element={<RequirePermission code="quizzes.take"><QuizDetailPage /></RequirePermission>} />
          <Route path="/quizzes/take/:attemptId" element={<RequirePermission code="quizzes.take"><QuizTakePage /></RequirePermission>} />
          <Route path="/quizzes/result/:attemptId" element={<RequirePermission code="quizzes.take"><QuizResultPage /></RequirePermission>} />
          <Route path="/quizzes/results" element={<RequirePermission code="quizzes.view_stats"><QuizResultsPage /></RequirePermission>} />
          <Route path="/quizzes/settings" element={<RequirePermission code="quizzes.manage_templates"><QuizSettingsPage /></RequirePermission>} />
          <Route path="/shop" element={<RequirePermission code="shop.view"><ShopPage /></RequirePermission>} />
          <Route path="/shop/history" element={<RequirePermission code="shop.view"><ShopHistoryPage /></RequirePermission>} />
          <Route path="/shop/manage" element={<RequirePermission code="shop.edit"><ShopManagePage /></RequirePermission>} />
          <Route path="/shop/manage/item/new" element={<RequirePermission code="shop.edit"><ShopItemEditPage /></RequirePermission>} />
          <Route path="/shop/manage/item/:id/edit" element={<RequirePermission code="shop.edit"><ShopItemEditPage /></RequirePermission>} />
          <Route path="/shop/coins" element={<RequirePermission code="shop.manage_coins"><ShopCoinsPage /></RequirePermission>} />
          <Route path="/shop/orders" element={<RequirePermission code="shop.manage_orders"><ShopOrdersPage /></RequirePermission>} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/profile" replace />} />
    </Routes>
  );
}
