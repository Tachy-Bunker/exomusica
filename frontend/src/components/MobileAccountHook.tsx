import { useState } from "react";
import { Link } from "react-router-dom";
import { usePresenceStore } from "../lib/presenceStore";
import { Avatar } from "./Avatar";

interface LoggedInProps {
  loggedIn: true;
  avatarUrl: string | null;
  username: string;
  isAdmin: boolean;
}
interface LoggedOutProps {
  loggedIn: false;
}

export function MobileAccountHook(props: LoggedInProps | LoggedOutProps) {
  const [open, setOpen] = useState(false);
  const onlineCount = usePresenceStore((s) => s.onlineCount);

  function openDonate() {
    window.open("https://paypal.me/tachybunker", "_blank", "popup=1,width=460,height=640");
  }

  return (
    <>
    {/* Top-left, mirroring the bell on the right */}
    {props.loggedIn
      ? <Link to="/account" className="mobile-acct" title={props.username} aria-label="Account"><Avatar url={props.avatarUrl} /></Link>
      : <Link to="/login" className="mobile-acct mobile-acct-login">Log in</Link>}
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
              <button className="btn" onClick={openDonate}>
                💛 Donate
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={openDonate}>
                💛 Donate
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
}
