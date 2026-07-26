import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../assets/wispr-type-logo.png";

const currentWindow = getCurrentWindow();

export default function WindowControls() {
  return (
    <div className="window-titlebar" data-tauri-drag-region>
      <div className="window-title" data-tauri-drag-region>
        <img src={logo} alt="" />
        <span>Wispr Type</span>
      </div>
      <div className="window-actions">
        <button
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void currentWindow.minimize()}
        >
          <Minus size={15} />
        </button>
        <button
          aria-label="Maximize"
          title="Maximize"
          onClick={() => void currentWindow.toggleMaximize()}
        >
          <Square size={12} />
        </button>
        <button
          className="window-close"
          aria-label="Close"
          title="Close"
          onClick={() => void currentWindow.close()}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
