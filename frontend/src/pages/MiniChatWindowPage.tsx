import { PopoutChatContent } from "../components/PopoutChatContent";

export function MiniChatWindowPage() {
  const params = new URLSearchParams(window.location.search);
  return (
    <div style={{ height: "100vh" }}>
      <PopoutChatContent initialSlug={params.get("slug")} initialName={params.get("name")} />
    </div>
  );
}
