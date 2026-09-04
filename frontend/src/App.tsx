import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ChromaticAberrationLayer } from "./components/ChromaticAberrationLayer";
import { MoireLayer } from "./components/MoireLayer";
import { AuthProvider } from "./lib/auth";
import { Layout } from "./components/Layout";
import { RequireAdmin } from "./components/RequireAdmin";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { JoinPage } from "./pages/JoinPage";
import { WikiPage } from "./pages/WikiPage";
import { NewsPage } from "./pages/NewsPage";
import { DiscussionIndexPage } from "./pages/DiscussionIndexPage";
import { TopicPage } from "./pages/TopicPage";
import { BranchPage } from "./pages/BranchPage";
import { AlbumPage } from "./pages/AlbumPage";
import { CollaboratorPage } from "./pages/CollaboratorPage";
import { CollaboratorSpacemapPage } from "./pages/CollaboratorSpacemapPage";
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
import { FxSettingsAdminPage } from "./pages/admin/FxSettingsAdminPage";
import { NewsletterAdminPage } from "./pages/admin/NewsletterAdminPage";
import { DiscordImportPage } from "./pages/admin/DiscordImportPage";
import { StorageAdminPage } from "./pages/admin/StorageAdminPage";
import { DiscordBridgePage } from "./pages/admin/DiscordBridgePage";
import { CollaboratorsAdminPage } from "./pages/admin/CollaboratorsAdminPage";
import { EmbedsAdminPage } from "./pages/admin/EmbedsAdminPage";
import { NotificationsAdminPage } from "./pages/admin/NotificationsAdminPage";
import { GuideAssetsAdminPage } from "./pages/admin/GuideAssetsAdminPage";

export default function App() {
  return (
    <>
      <ChromaticAberrationLayer />
      <div id="fixed-portal-root" />
      <div style={{ filter: "url(#caFilter)", minHeight: "100%" }}>
        <MoireLayer />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<LoginPage />} />
            <Route path="join" element={<JoinPage />} />
            <Route path="about" element={<Navigate to="/wiki" replace />} />
            <Route path="wiki" element={<WikiPage />} />
            <Route path="wiki/:slug" element={<WikiPage />} />
            <Route path="news" element={<NewsPage />} />
            <Route path="news/:slug" element={<NewsPage />} />
            <Route path="discussion" element={<DiscussionIndexPage />} />
            <Route path="branch/:slug" element={<BranchPage />} />
            <Route path="album/:slug" element={<AlbumPage />} />
            <Route path="collaborator/:slug" element={<CollaboratorPage />} />
            <Route path="collaborator/:slug/spacemap" element={<CollaboratorSpacemapPage />} />
            <Route path="topic/:slug" element={<TopicPage />} />
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
                <Route path="fx-settings" element={<FxSettingsAdminPage />} />
                <Route path="newsletter" element={<NewsletterAdminPage />} />
                <Route path="discord-import" element={<DiscordImportPage />} />
                <Route path="storage" element={<StorageAdminPage />} />
                <Route path="discord-bridge" element={<DiscordBridgePage />} />
                <Route path="collaborators" element={<CollaboratorsAdminPage />} />
                <Route path="embeds" element={<EmbedsAdminPage />} />
                <Route path="notifications" element={<NotificationsAdminPage />} />
                <Route path="guide-assets" element={<GuideAssetsAdminPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
      </div>
    </>
  );
}
