import { History, Settings2, ShieldCheck } from "lucide-react";
import logo from "../assets/wispr-type-logo.png";

export default function Sidebar({
  activeSection,
  historyCount,
  onNavigate,
}: {
  activeSection: "settings" | "history";
  historyCount: number;
  onNavigate: (section: "settings" | "history") => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logo} alt="Wispr Type" />
        <span>
          Wispr <b>Type</b>
        </span>
      </div>
      <nav>
        <a
          className={activeSection === "settings" ? "active" : ""}
          href="#settings"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("settings");
          }}
        >
          <Settings2 size={17} /> Settings
        </a>
        <a
          className={activeSection === "history" ? "active" : ""}
          href="#history"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("history");
          }}
        >
          <History size={17} /> History{" "}
          <span className="nav-count">{historyCount}</span>
        </a>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy">
          <ShieldCheck size={16} />
          <span>Keys stay on your device</span>
        </div>
        <div className="version">
          WISPR TYPE <span>{__APP_VERSION__}</span>
        </div>
      </div>
    </aside>
  );
}
