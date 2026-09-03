import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { api } from "../lib/api";
import type { Branch } from "../lib/types";
import { SpaceMap } from "../components/SpaceMap";

export function HomePage() {
  useDocumentTitle("");
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [topics, setTopics] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    api<Branch[]>("/api/branches").then(setBranches);
    api<{ slug: string; name: string }[]>("/api/channels?kind=DISCUSSION").then(setTopics);
  }, []);

  return (
    <div className="homepage-fill">
      <SpaceMap branches={branches} centerLabel={user ? "About" : "Join"} centerHref={user ? "/wiki" : "/join"} topics={topics} />
    </div>
  );
}
