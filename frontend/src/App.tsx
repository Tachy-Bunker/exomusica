import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { ChromaticAberrationLayer } from "./components/ChromaticAberrationLayer";
import { MoireLayer } from "./components/MoireLayer";
import { useSiteEffectsStore } from "./lib/siteEffectsStore";
import { AuthProvider } from "./lib/auth";
import { Layout } from "./components/Layout";
import { RequireAdmin } from "./components/RequireAdmin";
import { HomePage } from "./pages/HomePage";
import { MiniChatWindowPage } from "./pages/MiniChatWindowPage";
import { SoundbayPage } from "./pages/SoundbayPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { MembersPage } from "./pages/MembersPage";
import { LogPage } from "./pages/LogPage";
import { BranchIdentityAdminPage } from "./pages/admin/BranchIdentityAdminPage";
import { EmbedPlaylistPage } from "./pages/EmbedPlaylistPage";
import { EmbedMainSpacemapPage } from "./pages/EmbedMainSpacemapPage";
import { LoginPage } from "./pages/LoginPage";
import { JoinPage } from "./pages/JoinPage";
import { ListenPage } from "./pages/ListenPage";
import { ResearchPage } from "./pages/ResearchPage";
import { SubmitWorkPage } from "./pages/SubmitWorkPage";
import { StudyPage } from "./pages/StudyPage";
import { DiscussionIndexPage } from "./pages/DiscussionIndexPage";
import { ForumMapPage } from "./pages/ForumMapPage";
import { TopicPage } from "./pages/TopicPage";
import { BranchPage } from "./pages/BranchPage";
import { AlbumPage } from "./pages/AlbumPage";
import { CommunityAlbumPage } from "./pages/CommunityAlbumPage";
import { CommunityPage } from "./pages/CommunityPage";
import { MyMusicPage } from "./pages/MyMusicPage";
import { PlaylistPage } from "./pages/PlaylistPage";
import { PlaylistSpaceMapPage } from "./pages/PlaylistSpaceMapPage";
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
import { AllTracksAdminPage } from "./pages/admin/AllTracksAdminPage";
import { StudiesAdminPage } from "./pages/admin/StudiesAdminPage";
import { ResourcesAdminPage } from "./pages/admin/ResourcesAdminPage";
import { FeaturedAdminPage } from "./pages/admin/FeaturedAdminPage";
import { RewardsAdminPage } from "./pages/admin/RewardsAdminPage";
import { HypothesesPage, HypothesisDrawPage } from "./pages/HypothesesPage";
import { HypothesisPage } from "./pages/HypothesisPage";
import { LettersPage } from "./pages/LettersPage";
import { SignalPage } from "./pages/SignalPage";
import { SignalAdminPage } from "./pages/admin/SignalAdminPage";
import { RewardsPage } from "./pages/RewardsPage";
import { BranchContributeAdminPage } from "./pages/admin/BranchContributeAdminPage";
import { SubmissionsAdminPage } from "./pages/admin/SubmissionsAdminPage";
import { ContributorPointsAdminPage } from "./pages/admin/ContributorPointsAdminPage";
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
import { IconLibraryAdminPage } from "./pages/admin/IconLibraryAdminPage";
import { ForumMapAdminPage } from "./pages/admin/ForumMapAdminPage";
import { NotificationsAdminPage } from "./pages/admin/NotificationsAdminPage";
import { GuideAssetsAdminPage } from "./pages/admin/GuideAssetsAdminPage";
import { CommunitySpotlightAdminPage } from "./pages/admin/CommunitySpotlightAdminPage";
import { useIsDesktop } from "./lib/useIsDesktop";

/** The old address of Telemetry: same page, same filters in the address. */
function ConversationsRedirect() {
  const loc = useLocation();
  return <Navigate to={`/telemetry${loc.search}`} replace />;
}

const VoiceLabPage = lazy(() => import("./pages/VoiceLabPage").then((m) => ({ default: m.VoiceLabPage })));

/** A resource or open call has its own address (for sharing and for link previews); it opens in XenoLab, scrolled to that card. */
function ResourceRedirect() { const { id } = useParams(); return <Navigate to={`/xenolab?tab=resources&item=${encodeURIComponent(id ?? "")}`} replace />; }
function OpenCallRedirect() { const { id } = useParams(); return <Navigate to={`/xenolab?tab=open&call=${encodeURIComponent(id ?? "")}`} replace />; }

export default function App() {
  const isDesktop = useIsDesktop();
  const userCaEnabled = useSiteEffectsStore((s) => s.userCaEnabled);
  const isEmbed = window.location.pathname.startsWith("/embed/");
  const applyCaFilter = isDesktop && userCaEnabled && !isEmbed;
  return (
    <>
      {isDesktop && !isEmbed && <ChromaticAberrationLayer />}
      <div id="fixed-portal-root" />
      <div style={applyCaFilter ? { filter: "url(#caFilter)", minHeight: "100%" } : { minHeight: "100%" }}>
        {isDesktop && !isEmbed && <MoireLayer />}
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="chat-window" element={<MiniChatWindowPage />} />
              <Route path="embed/playlist/:slug" element={<EmbedPlaylistPage />} />
              <Route path="embed/main-spacemap" element={<EmbedMainSpacemapPage />} />
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<LoginPage />} />
            <Route path="join" element={<JoinPage />} />
            <Route path="about" element={<Navigate to="/wiki" replace />} />
            <Route path="wiki" element={<LogPage />} />
            <Route path="studies" element={<Navigate to="/xenolab?tab=studies" replace />} />
            <Route path="lab/voice" element={<Suspense fallback={null}><VoiceLabPage /></Suspense>} />
            <Route path="contribute" element={<Navigate to="/xenolab?tab=contribute" replace />} />
            <Route path="listen" element={<ListenPage />} />
              <Route path="xenolab" element={<ResearchPage />} />
              <Route path="research" element={<Navigate to="/xenolab" replace />} />
              <Route path="soundbay" element={<SoundbayPage />} />
              <Route path="telemetry" element={<ConversationsPage />} />
              <Route path="conversations" element={<ConversationsRedirect />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="log" element={<Navigate to="/wiki" replace />} />
            <Route path="submit" element={<SubmitWorkPage />} />
            <Route path="study/:slug" element={<StudyPage />} />
            <Route path="wiki/:slug" element={<LogPage />} />
            <Route path="news" element={<LogPage />} />
            <Route path="news/:slug" element={<LogPage />} />
            <Route path="discussion" element={<DiscussionIndexPage />} />
            <Route path="discussion/map" element={<ForumMapPage />} />
            <Route path="branch/:slug" element={<BranchPage />} />
            <Route path="album/:slug" element={<AlbumPage />} />
            <Route path="community-album/:slug" element={<CommunityAlbumPage />} />
            <Route path="cult" element={<CommunityPage />} />
            <Route path="my-music" element={<MyMusicPage />} />
            <Route path="sample-bank" element={<Navigate to="/xenolab?tab=resources" replace />} />
            <Route path="challenges" element={<Navigate to="/xenolab?tab=open" replace />} />
            <Route path="resource/:id" element={<ResourceRedirect />} />
            <Route path="open-call/:id" element={<OpenCallRedirect />} />
            <Route path="playlist/:slug" element={<PlaylistSpaceMapPage />} />
            <Route path="playlist/:slug/list" element={<PlaylistPage />} />
            <Route path="collaborator/:slug" element={<CollaboratorPage />} />
            <Route path="collaborator/:slug/spacemap" element={<CollaboratorSpacemapPage />} />
            <Route path="topic/:slug" element={<TopicPage />} />
            <Route path="u/:username" element={<ProfilePage />} />
            <Route path="pms" element={<PMsPage />} />
            <Route path="pms/:username" element={<PMsPage />} />
            <Route path="account" element={<AccountSettingsPage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="signal" element={<SignalPage />} />
            <Route path="letters" element={<LettersPage />} />
            <Route path="hypotheses" element={<HypothesesPage />} />
            <Route path="hypotheses/draw" element={<HypothesisDrawPage />} />
            <Route path="hypothesis/:id" element={<HypothesisPage />} />

            <Route path="admin" element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Navigate to="join-requests" replace />} />
                <Route path="join-requests" element={<JoinRequestsPage />} />
                <Route path="branches" element={<BranchesPage />} />
                <Route path="channels" element={<ChannelsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="albums" element={<AlbumsAdminPage />} />
                <Route path="wiki" element={<WikiAdminPage />} />
                <Route path="all-tracks" element={<AllTracksAdminPage />} />
                <Route path="studies" element={<StudiesAdminPage />} />
                <Route path="resources" element={<ResourcesAdminPage />} />
                <Route path="featured" element={<FeaturedAdminPage />} />
                <Route path="rewards" element={<RewardsAdminPage />} />
                <Route path="signal" element={<SignalAdminPage />} />
                <Route path="branches/:id/contribute" element={<BranchContributeAdminPage />} />
                <Route path="branches/:id/identity" element={<BranchIdentityAdminPage />} />
                <Route path="submissions" element={<SubmissionsAdminPage />} />
                <Route path="contributor-points" element={<ContributorPointsAdminPage />} />
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
                <Route path="icon-library" element={<IconLibraryAdminPage />} />
                <Route path="forum-map" element={<ForumMapAdminPage />} />
                <Route path="notifications" element={<NotificationsAdminPage />} />
                <Route path="guide-assets" element={<GuideAssetsAdminPage />} />
                <Route path="community-spotlight" element={<CommunitySpotlightAdminPage />} />
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
