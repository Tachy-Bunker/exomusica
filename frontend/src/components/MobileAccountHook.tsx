import { useState } from "react";
import { Link } from "react-router-dom";
import { usePresenceStore } from "../lib/presenceStore";
import { MailIcon, MailNotificationIcon } from "./Icons";
import { Avatar } from "./Avatar";

export function MobileAccountHook({
  avatarUrl,
  hasUnreadPms,
  username,
}: {
  avatarUrl: string | null;
  hasUnreadPms: boolean;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  const onlineCount = usePresenceStore((s) => s.onlineCount);

  return (
    <div className="mobile-hook-wrap">
      <button className="mobile-hook-tab" onClick={() => setOpen((v) => !v)} aria-label="Account">
        ⌄
      </button>
      {open && (
        <div className="mobile-hook-panel">
          <span className="mobile-hook-online">{onlineCount} online</span>
          <Link to="/pms" onClick={() => setOpen(false)} style={{ color: "var(--accent-forum)", display: "inline-flex" }}>
            {hasUnreadPms ? <MailNotificationIcon /> : <MailIcon />}
          </Link>
          <Link to="/account" onClick={() => setOpen(false)} title={username}>
            <Avatar url={avatarUrl} />
          </Link>
        </div>
      )}
    </div>
  );
}
