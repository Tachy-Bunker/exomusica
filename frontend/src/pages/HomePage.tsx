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

  useEffect(() => {
    api<Branch[]>("/api/branches").then(setBranches);
  }, []);

  return (
    <div>
      <details className="homepage-intro">
        <summary>About Exomusica</summary>
        <div className="body">
          <p>
            Exomusica is a collective that creates accessible experimental music.
            <br />
            You are free to join the collective, as a listener, a musician, or researcher!
          </p>
          <button
            className="donate-btn"
            onClick={() => window.open("https://paypal.me/tachybunker", "_blank", "popup=1,width=460,height=640")}
          >
            💛 Donate
          </button>
        </div>
      </details>

      <SpaceMap branches={branches} centerLabel={user ? "About" : "Join"} centerHref={user ? "/about" : "/join"} />
    </div>
  );
}
