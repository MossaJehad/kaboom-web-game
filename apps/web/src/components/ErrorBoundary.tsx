import React from "react";

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Unexpected application error." };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#121629] text-[#fef8e6] flex items-center justify-center p-6">
          <div className="pixel-panel max-w-lg w-full p-6 text-center space-y-4">
            <h1 className="font-arcade-title text-lg text-[#e84545]">CABINET FAULT</h1>
            <p className="text-sm text-[#b8c2dc]">{this.state.message}</p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="pixel-btn pixel-btn-primary text-xs"
              >
                Reload Game
              </button>
              <a href="/" className="pixel-btn pixel-btn-secondary text-xs">
                Main Menu
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
