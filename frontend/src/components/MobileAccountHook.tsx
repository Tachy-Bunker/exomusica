import { useState } from "react";
import { Link } from "react-router-dom";
import { usePresenceStore } from "../lib/presenceStore";
import { MailIcon, MailNotificationIcon } from "./Icons";
import { Avatar } from "./Avatar";

interface LoggedInProps {
  loggedIn: true;
  avatarUrl: string | null;
  hasUnreadPms: boolean;
  username: string;
  isAdmin: boolean;
}
interface LoggedOutProps {
  loggedIn: false;
}

export function MobileAccountHook(props: LoggedInProps | LoggedOutProps) {
  const [open, setOpen] = useState(false);
  const onlineCount = usePresenceStore((s) => s.onlineCount);

  return (
    <div className="mobile-hook-wrap">
      <button className="mobile-hook-tab" onClick={() => setOpen((v) => !v)} aria-label="Account">
        ⌄
      </button>
      {open && (
        <div className="mobile-hook-panel">
          {props.loggedIn ? (
            <>
              <span className="mobile-hook-online">{onlineCount} online</span>
              {props.isAdmin && (
                <Link to="/admin" onClick={() => setOpen(false)}>
                  Admin
                </Link>
              )}
              <Link to="/pms" onClick={() => setOpen(false)} style={{ color: "var(--accent-forum)", display: "inline-flex" }}>
                {props.hasUnreadPms ? <MailNotificationIcon /> : <MailIcon />}
              </Link>
              <Link to="/account" onClick={() => setOpen(false)} title={props.username}>
                <Avatar url={props.avatarUrl} />
              </Link>
            </>
          ) : (
            <Link to="/login" onClick={() => setOpen(false)}>
              Log in
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
