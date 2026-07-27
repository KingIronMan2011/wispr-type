import { History, Settings2, ShieldCheck } from "lucide-react";
import logo from "../assets/veskri-logo.png";

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
        <img src={logo} alt="Veskri" />
        <span>Veskri</span>
      </div>
      <nav aria-label="Primary navigation">
        <a
          className={activeSection === "settings" ? "active" : ""}
          aria-current={activeSection === "settings" ? "location" : undefined}
          href="#settings"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("settings");
          }}
        >
          <Settings2 size={17} aria-hidden="true" /> Settings
        </a>
        <a
          className={activeSection === "history" ? "active" : ""}
          aria-current={activeSection === "history" ? "location" : undefined}
          href="#history"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("history");
          }}
        >
          <History size={17} aria-hidden="true" /> History{" "}
          <span className="nav-count">{historyCount}</span>
        </a>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy">
          <ShieldCheck size={16} />
          <span>Keys stay on your device</span>
        </div>
        <div className="version">
          VESKRI <span>{__APP_VERSION__}</span>
        </div>
      </div>
    </aside>
  );
}
