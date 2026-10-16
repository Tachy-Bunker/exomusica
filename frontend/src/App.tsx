const StormPage = lazy(() => import("./pages/StormPage").then((m) => ({ default: m.StormPage })));
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { ChromaticAberrationLayer } from "./components/ChromaticAberrationLayer";
import { MoireLayer } from "./components/MoireLayer";
import { useSiteEffectsStore } from "./lib/siteEffectsStore";
import { AuthProvider } from "./lib/auth";
import { Layout } from "./components/Layout";
import { RequireAdmin } from "./components/RequireAdmin";
import { HomePage } from "./pages/HomePage";
const MiniChatWindowPage = lazy(() => import("./pages/MiniChatWindowPage").then((m) => ({ default: m.MiniChatWindowPage })));
const SoundbayPage = lazy(() => import("./pages/SoundbayPage").then((m) => ({ default: m.SoundbayPage })));
const ConversationsPage = lazy(() => import("./pages/ConversationsPage").then((m) => ({ default: m.ConversationsPage })));
const MembersPage = lazy(() => import("./pages/MembersPage").then((m) => ({ default: m.MembersPage })));
const LogPage = lazy(() => import("./pages/LogPage").then((m) => ({ default: m.LogPage })));
const BranchIdentityAdminPage = lazy(() => import("./pages/admin/BranchIdentityAdminPage").then((m) => ({ default: m.BranchIdentityAdminPage })));
const EmbedPlaylistPage = lazy(() => import("./pages/EmbedPlaylistPage").then((m) => ({ default: m.EmbedPlaylistPage })));
const EmbedMainSpacemapPage = lazy(() => import("./pages/EmbedMainSpacemapPage").then((m) => ({ default: m.EmbedMainSpacemapPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const JoinPage = lazy(() => import("./pages/JoinPage").then((m) => ({ default: m.JoinPage })));
const ListenPage = lazy(() => import("./pages/ListenPage").then((m) => ({ default: m.ListenPage })));
const ResearchPage = lazy(() => import("./pages/ResearchPage").then((m) => ({ default: m.ResearchPage })));
const SubmitWorkPage = lazy(() => import("./pages/SubmitWorkPage").then((m) => ({ default: m.SubmitWorkPage })));
const StudyPage = lazy(() => import("./pages/StudyPage").then((m) => ({ default: m.StudyPage })));
const DiscussionIndexPage = lazy(() => import("./pages/DiscussionIndexPage").then((m) => ({ default: m.DiscussionIndexPage })));
const ForumMapPage = lazy(() => import("./pages/ForumMapPage").then((m) => ({ default: m.ForumMapPage })));
const TopicPage = lazy(() => import("./pages/TopicPage").then((m) => ({ default: m.TopicPage })));
const BranchPage = lazy(() => import("./pages/BranchPage").then((m) => ({ default: m.BranchPage })));
const AlbumPage = lazy(() => import("./pages/AlbumPage").then((m) => ({ default: m.AlbumPage })));
const OfflinePage = lazy(() => import("./pages/OfflinePage").then((m) => ({ default: m.OfflinePage })));
const CommunityAlbumPage = lazy(() => import("./pages/CommunityAlbumPage").then((m) => ({ default: m.CommunityAlbumPage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage").then((m) => ({ default: m.CommunityPage })));
const MyMusicPage = lazy(() => import("./pages/MyMusicPage").then((m) => ({ default: m.MyMusicPage })));
const PlaylistPage = lazy(() => import("./pages/PlaylistPage").then((m) => ({ default: m.PlaylistPage })));
const PlaylistSpaceMapPage = lazy(() => import("./pages/PlaylistSpaceMapPage").then((m) => ({ default: m.PlaylistSpaceMapPage })));
const CollaboratorPage = lazy(() => import("./pages/CollaboratorPage").then((m) => ({ default: m.CollaboratorPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const PostPage = lazy(() => import("./pages/PostPage").then((m) => ({ default: m.PostPage })));
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage").then((m) => ({ default: m.AccountSettingsPage })));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const JoinRequestsPage = lazy(() => import("./pages/admin/JoinRequestsPage").then((m) => ({ default: m.JoinRequestsPage })));
const BranchesPage = lazy(() => import("./pages/admin/BranchesPage").then((m) => ({ default: m.BranchesPage })));
const ChannelsPage = lazy(() => import("./pages/admin/ChannelsPage").then((m) => ({ default: m.ChannelsPage })));
const UsersPage = lazy(() => import("./pages/admin/UsersPage").then((m) => ({ default: m.UsersPage })));
const AlbumsAdminPage = lazy(() => import("./pages/admin/AlbumsAdminPage").then((m) => ({ default: m.AlbumsAdminPage })));
import { AttentionPage } from "./components/admin/Attention";
const WikiAdminPage = lazy(() => import("./pages/admin/WikiAdminPage").then((m) => ({ default: m.WikiAdminPage })));
const AllTracksAdminPage = lazy(() => import("./pages/admin/AllTracksAdminPage").then((m) => ({ default: m.AllTracksAdminPage })));
const StudiesAdminPage = lazy(() => import("./pages/admin/StudiesAdminPage").then((m) => ({ default: m.StudiesAdminPage })));
const ResourcesAdminPage = lazy(() => import("./pages/admin/ResourcesAdminPage").then((m) => ({ default: m.ResourcesAdminPage })));
const LedgerPage = lazy(() => import("./pages/LedgerPage").then((m) => ({ default: m.LedgerPage })));
const GlossaryAdminPage = lazy(() => import("./pages/admin/GlossaryAdminPage").then((m) => ({ default: m.GlossaryAdminPage })));
const LoreAdminPage = lazy(() => import("./pages/admin/LoreAdminPage").then((m) => ({ default: m.LoreAdminPage })));
const MapLayoutAdminPage = lazy(() => import("./pages/admin/MapLayoutAdminPage").then((m) => ({ default: m.MapLayoutAdminPage })));
const MilestonesAdminPage = lazy(() => import("./pages/admin/MilestonesAdminPage").then((m) => ({ default: m.MilestonesAdminPage })));
const FeaturedAdminPage = lazy(() => import("./pages/admin/FeaturedAdminPage").then((m) => ({ default: m.FeaturedAdminPage })));
const RewardsAdminPage = lazy(() => import("./pages/admin/RewardsAdminPage").then((m) => ({ default: m.RewardsAdminPage })));
const HypothesesPage = lazy(() => import("./pages/HypothesesPage").then((m) => ({ default: m.HypothesesPage })));
const HypothesisDrawPage = lazy(() => import("./pages/HypothesesPage").then((m) => ({ default: m.HypothesisDrawPage })));
const HypothesisPage = lazy(() => import("./pages/HypothesisPage").then((m) => ({ default: m.HypothesisPage })));
const PostRedirect = lazy(() => import("./pages/PostRedirect").then((m) => ({ default: m.PostRedirect })));
const SignalPage = lazy(() => import("./pages/SignalPage").then((m) => ({ default: m.SignalPage })));
const SignalStudioPage = lazy(() => import("./pages/admin/SignalStudioPage").then((m) => ({ default: m.SignalStudioPage })));
const SignalAdminPage = lazy(() => import("./pages/admin/SignalAdminPage").then((m) => ({ default: m.SignalAdminPage })));
const RewardsPage = lazy(() => import("./pages/RewardsPage").then((m) => ({ default: m.RewardsPage })));
const BranchContributeAdminPage = lazy(() => import("./pages/admin/BranchContributeAdminPage").then((m) => ({ default: m.BranchContributeAdminPage })));
const SubmissionsAdminPage = lazy(() => import("./pages/admin/SubmissionsAdminPage").then((m) => ({ default: m.SubmissionsAdminPage })));
const ContributorPointsAdminPage = lazy(() => import("./pages/admin/ContributorPointsAdminPage").then((m) => ({ default: m.ContributorPointsAdminPage })));
const BlogAdminPage = lazy(() => import("./pages/admin/BlogAdminPage").then((m) => ({ default: m.BlogAdminPage })));
const EmojiAdminPage = lazy(() => import("./pages/admin/EmojiAdminPage").then((m) => ({ default: m.EmojiAdminPage })));
const EmailTemplatesAdminPage = lazy(() => import("./pages/admin/EmailTemplatesAdminPage").then((m) => ({ default: m.EmailTemplatesAdminPage })));
const JamPage = lazy(() => import("./pages/JamPage").then((m) => ({ default: m.JamPage })));
const RadioPage = lazy(() => import("./pages/RadioPage").then((m) => ({ default: m.RadioPage })));
const VisorAdminPage = lazy(() => import("./pages/admin/VisorAdminPage").then((m) => ({ default: m.VisorAdminPage })));
const RadioAdminPage = lazy(() => import("./pages/admin/RadioAdminPage").then((m) => ({ default: m.RadioAdminPage })));
const CapsulePage = lazy(() => import("./pages/CapsulePage").then((m) => ({ default: m.CapsulePage })));
const FieldLogPage = lazy(() => import("./pages/FieldLogPage").then((m) => ({ default: m.FieldLogPage })));
const ChartPage = lazy(() => import("./pages/ChartPage").then((m) => ({ default: m.ChartPage })));
const VaultPage = lazy(() => import("./pages/VaultPage").then((m) => ({ default: m.VaultPage })));
const BranchRoomPage = lazy(() => import("./pages/BranchRoomPage").then((m) => ({ default: m.BranchRoomPage })));
const ExplorePage = lazy(() => import("./pages/ExplorePage").then((m) => ({ default: m.ExplorePage })));
const AuditLogAdminPage = lazy(() => import("./pages/admin/AuditLogAdminPage").then((m) => ({ default: m.AuditLogAdminPage })));
const TrashAdminPage = lazy(() => import("./pages/admin/TrashAdminPage").then((m) => ({ default: m.TrashAdminPage })));
const InboxAdminPage = lazy(() => import("./pages/admin/InboxAdminPage").then((m) => ({ default: m.InboxAdminPage })));
const AboutAdminPage = lazy(() => import("./pages/admin/AboutAdminPage").then((m) => ({ default: m.AboutAdminPage })));
const FontsAdminPage = lazy(() => import("./pages/admin/FontsAdminPage").then((m) => ({ default: m.FontsAdminPage })));
const FxSettingsAdminPage = lazy(() => import("./pages/admin/FxSettingsAdminPage").then((m) => ({ default: m.FxSettingsAdminPage })));
const NewsletterAdminPage = lazy(() => import("./pages/admin/NewsletterAdminPage").then((m) => ({ default: m.NewsletterAdminPage })));
const DiscordImportPage = lazy(() => import("./pages/admin/DiscordImportPage").then((m) => ({ default: m.DiscordImportPage })));
const StorageAdminPage = lazy(() => import("./pages/admin/StorageAdminPage").then((m) => ({ default: m.StorageAdminPage })));
const DiscordBridgePage = lazy(() => import("./pages/admin/DiscordBridgePage").then((m) => ({ default: m.DiscordBridgePage })));
const CollaboratorsAdminPage = lazy(() => import("./pages/admin/CollaboratorsAdminPage").then((m) => ({ default: m.CollaboratorsAdminPage })));
const EmbedsAdminPage = lazy(() => import("./pages/admin/EmbedsAdminPage").then((m) => ({ default: m.EmbedsAdminPage })));
const IconLibraryAdminPage = lazy(() => import("./pages/admin/IconLibraryAdminPage").then((m) => ({ default: m.IconLibraryAdminPage })));
const ForumMapAdminPage = lazy(() => import("./pages/admin/ForumMapAdminPage").then((m) => ({ default: m.ForumMapAdminPage })));
const NotificationsAdminPage = lazy(() => import("./pages/admin/NotificationsAdminPage").then((m) => ({ default: m.NotificationsAdminPage })));
const GuideAssetsAdminPage = lazy(() => import("./pages/admin/GuideAssetsAdminPage").then((m) => ({ default: m.GuideAssetsAdminPage })));
const CommunitySpotlightAdminPage = lazy(() => import("./pages/admin/CommunitySpotlightAdminPage").then((m) => ({ default: m.CommunitySpotlightAdminPage })));
import { useIsDesktop } from "./lib/useIsDesktop";

/** The old address of Telemetry: same page, same filters in the address. */
function ConversationsRedirect() {
  const loc = useLocation();
  return <Navigate to={`/telemetry${loc.search}`} replace />;
}

const OutreachPage = lazy(() => import("./pages/OutreachPage").then((m) => ({ default: m.OutreachPage })));
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
            <Suspense fallback={null}>
            <Routes>
              <Route path="chat-window" element={<MiniChatWindowPage />} />
              <Route path="outreach" element={<Suspense fallback={null}><OutreachPage /></Suspense>} />
              <Route path="outreach/:slug" element={<Suspense fallback={null}><OutreachPage /></Suspense>} />
              <Route path="embed/playlist/:slug" element={<EmbedPlaylistPage />} />
              <Route path="embed/main-spacemap" element={<EmbedMainSpacemapPage />} />
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<LoginPage />} />
            <Route path="join" element={<JoinPage />} />
            <Route path="about" element={<Navigate to="/wiki" replace />} />
            <Route path="wiki" element={<LogPage />} />
            <Route path="capsule" element={<CapsulePage />} />
            <Route path="field-log" element={<FieldLogPage />} />
            <Route path="chart" element={<ChartPage />} />
            <Route path="vault" element={<VaultPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="radio" element={<RadioPage />} />
            <Route path="storm" element={<StormPage />} />
            <Route path="jam" element={<JamPage />} />
            <Route path="jam/:code" element={<JamPage />} />
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
            <Route path="branch/:slug/room" element={<BranchRoomPage />} />
            <Route path="album/:slug" element={<AlbumPage />} />
            <Route path="offline" element={<OfflinePage />} />
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
            <Route path="collaborator/:slug/spacemap" element={<PlaylistSpaceMapPage />} />
            <Route path="collaborator/:slug/list" element={<PlaylistPage />} />
            <Route path="topic/:slug" element={<TopicPage />} />
            <Route path="u/:username" element={<ProfilePage />} />
            <Route path="pms" element={<PostPage />} />
            <Route path="pms/:username" element={<PostPage />} />
            <Route path="account" element={<AccountSettingsPage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="signal" element={<SignalPage />} />
            <Route path="letters" element={<PostRedirect />} />
            <Route path="hypotheses" element={<HypothesesPage />} />
            <Route path="hypotheses/draw" element={<HypothesisDrawPage />} />
            <Route path="hypothesis/:id" element={<HypothesisPage />} />

            <Route path="admin" element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Navigate to="join-requests" replace />} />
                <Route path="attention" element={<AttentionPage />} />
                <Route path="join-requests" element={<JoinRequestsPage />} />
                <Route path="branches" element={<BranchesPage />} />
                <Route path="channels" element={<ChannelsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="albums" element={<AlbumsAdminPage />} />
                <Route path="wiki" element={<WikiAdminPage />} />
                <Route path="all-tracks" element={<AllTracksAdminPage />} />
                <Route path="studies" element={<StudiesAdminPage />} />
                <Route path="resources" element={<ResourcesAdminPage />} />
                <Route path="glossary" element={<GlossaryAdminPage />} />
                <Route path="lore" element={<LoreAdminPage />} />
                <Route path="map-layout" element={<MapLayoutAdminPage />} />
                <Route path="milestones" element={<MilestonesAdminPage />} />
                <Route path="featured" element={<FeaturedAdminPage />} />
                <Route path="rewards" element={<RewardsAdminPage />} />
                <Route path="signal" element={<SignalAdminPage />} />
                <Route path="signal-studio" element={<SignalStudioPage />} />
                <Route path="branches/:id/contribute" element={<BranchContributeAdminPage />} />
                <Route path="branches/:id/identity" element={<BranchIdentityAdminPage />} />
                <Route path="submissions" element={<SubmissionsAdminPage />} />
                <Route path="contributor-points" element={<ContributorPointsAdminPage />} />
                <Route path="blog" element={<BlogAdminPage />} />
                <Route path="emoji" element={<EmojiAdminPage />} />
                <Route path="email-templates" element={<EmailTemplatesAdminPage />} />
                <Route path="audit-log" element={<AuditLogAdminPage />} />
                <Route path="trash" element={<TrashAdminPage />} />
                <Route path="radio" element={<RadioAdminPage />} />
                <Route path="visor" element={<VisorAdminPage />} />
                <Route path="inbox" element={<InboxAdminPage />} />
                <Route path="about" element={<AboutAdminPage />} />
                <Route path="fonts" element={<FontsAdminPage />} />
                <Route path="fx-settings" element={<FxSettingsAdminPage />} />
                <Route path="newsletter" element={<NewsletterAdminPage />} />
                <Route path="outreach" element={<Navigate to="/outreach" replace />} />
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
          </Suspense>
      </AuthProvider>
    </BrowserRouter>
      </div>
    </>
  );
}
