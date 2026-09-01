import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { Layout } from "./components/Layout";
import { RequireAdmin } from "./components/RequireAdmin";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { JoinPage } from "./pages/JoinPage";
import { AboutPage } from "./pages/AboutPage";
import { WikiPage } from "./pages/WikiPage";
import { NewsPage } from "./pages/NewsPage";
import { DiscussionIndexPage } from "./pages/DiscussionIndexPage";
import { BranchPage } from "./pages/BranchPage";
import { AlbumPage } from "./pages/AlbumPage";
import { ChannelPage } from "./pages/ChannelPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PMsPage } from "./pages/PMsPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { JoinRequestsPage } from "./pages/admin/JoinRequestsPage";
import { BranchesPage } from "./pages/admin/BranchesPage";
import { ChannelsPage } from "./pages/admin/ChannelsPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { AlbumsAdminPage } from "./pages/admin/AlbumsAdminPage";
import { WikiAdminPage } from "./pages/admin/WikiAdminPage";
import { BlogAdminPage } from "./pages/admin/BlogAdminPage";
import { EmojiAdminPage } from "./pages/admin/EmojiAdminPage";
import { EmailTemplatesAdminPage } from "./pages/admin/EmailTemplatesAdminPage";
import { AuditLogAdminPage } from "./pages/admin/AuditLogAdminPage";
import { AboutAdminPage } from "./pages/admin/AboutAdminPage";
import { FontsAdminPage } from "./pages/admin/FontsAdminPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="join" element={<JoinPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="wiki" element={<WikiPage />} />
            <Route path="wiki/:slug" element={<WikiPage />} />
            <Route path="news" element={<NewsPage />} />
            <Route path="news/:slug" element={<NewsPage />} />
            <Route path="discussion" element={<DiscussionIndexPage />} />
            <Route path="branch/:slug" element={<BranchPage />} />
            <Route path="album/:slug" element={<AlbumPage />} />
            <Route path="topic/:slug" element={<ChannelPage />} />
            <Route path="u/:username" element={<ProfilePage />} />
            <Route path="pms" element={<PMsPage />} />
            <Route path="pms/:username" element={<PMsPage />} />
            <Route path="account" element={<AccountSettingsPage />} />

            <Route path="admin" element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Navigate to="join-requests" replace />} />
                <Route path="join-requests" element={<JoinRequestsPage />} />
                <Route path="branches" element={<BranchesPage />} />
                <Route path="channels" element={<ChannelsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="albums" element={<AlbumsAdminPage />} />
                <Route path="wiki" element={<WikiAdminPage />} />
                <Route path="blog" element={<BlogAdminPage />} />
                <Route path="emoji" element={<EmojiAdminPage />} />
                <Route path="email-templates" element={<EmailTemplatesAdminPage />} />
                <Route path="audit-log" element={<AuditLogAdminPage />} />
                <Route path="about" element={<AboutAdminPage />} />
                <Route path="fonts" element={<FontsAdminPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
